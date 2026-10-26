import { createHash } from 'crypto';
import { ConversationStore, ConversationSecurityError, ChatMessageRecord } from '../conversation';
import { SophiaContextAssembler } from './context-assembly';
import { SophiaIntentClassifier } from './intent-classifier';
import { SophiaServerGateway } from './server-gateway';
import { scheduleSophiaMemoryCapture } from './memory-capture-stage';
import { SophiaRoute, MemoryScope } from './types';
import {
  SophiaDecisionLogEntry,
  DecisionOutcome,
  buildDecisionLogEntry,
  isExplanationQuery,
  formatDecisionLogExplanation,
  formatNoDecisionLogExplanation,
} from './decision-log';
import {
  SafeModeManager,
  isStopCommand,
  isResumeCommand,
} from './stop-control';
import { SpendSettingsManager } from './spend-settings';

export interface ExecuteSophiaTurnOptions {
  message: string;
  founderId: string;
  conversationId?: string;
  turnId?: string;
  executeDirective?: boolean;
  /**
   * Scope-aware context partition override (M1.3 / G12.3).
   * When omitted, automatically derived from the classified route.
   */
  scope?: 'all' | 'personal_only' | 'company_only' | 'none';
  /**
   * Explicit route override (M1.2 / M1.3).
   */
  route?: SophiaRoute;
  /**
   * Ingress channel label recorded on the persisted assistant message
   * (observability only — never an authority signal). Defaults to
   * 'live_voice'; the SOFIA ask surface passes 'sofia_ask'.
   */
  ingress?: string;
  /**
   * Cooperative cancellation (Phase 3 — SofiaUI voice runtime).
   *
   * When aborted, the turn stops at the NEXT stage boundary of this
   * executor (before founder-message persistence, before the trust-boundary
   * gateway, or before assistant persistence) and resolves with
   * `cancelled: true` instead of throwing. In-flight provider calls inside
   * SophiaServerGateway.process are NOT interrupted mid-flight — they run
   * to completion server-side and their result is discarded (documented
   * limitation; threading the signal deeper into the gateway/tool layer is
   * a separate, larger change).
   *
   * Cancellation semantics for canonical persistence:
   *   - Cancelled BEFORE the founder message is persisted: nothing is
   *     recorded — the turn never entered the conversation, so a retry with
   *     the same turnId re-executes (correct: it never executed).
   *   - Cancelled AFTER the founder message is persisted: a terse cancelled
   *     assistant marker is persisted under the standard
   *     `${turnId}:assistant` idempotency key with
   *     `metadata.cancelled = true`. This closes the idempotency loop — a
   *     retry of the same turnId replays the cancellation marker instead of
   *     re-executing the directive (the exactly-once guarantee holds across
   *     cancellation).
   *
   * All in-flight-lock waiters for the same turn receive the same settled
   * (possibly cancelled) result.
   */
  signal?: AbortSignal;
}

export interface SophiaTurnResult {
  success: boolean;
  reply: string;
  conversationId: string;
  founderMessageId?: string;
  assistantMessageId?: string;
  intent: string;
  directiveExecuted: boolean;
  liveAi: boolean;
  metrics?: any;
  error?: string;
  idempotentReplay?: boolean;
  /** True when the turn was stopped at a stage boundary by an aborted
   * `signal` (Phase 3 cancellation) — no reply is delivered. */
  cancelled?: boolean;
  scopes?: MemoryScope[];
  sources?: string[];
  sourceIds?: string[];
  decisionLog?: SophiaDecisionLogEntry;
}

/** Persisted content of the cancelled-turn assistant marker (Phase 3). */
export const SOPHIA_TURN_CANCELLED_MARKER = '(turn interrupted)';

// In-flight turn concurrency locks across all ingress channels
const inFlightTurns = new Map<string, Promise<SophiaTurnResult>>();

/**
 * Builds the settled result for a turn cancelled at a stage boundary
 * (Phase 3). If the founder message for this turn is already durably
 * recorded, a cancelled assistant marker is persisted under the standard
 * `${turnId}:assistant` idempotency key so retries replay the cancellation
 * instead of re-executing (see ExecuteSophiaTurnOptions.signal docs).
 */
async function cancelledTurnResult(
  conversationId: string,
  founderId: string,
  cleanTurnId: string | undefined,
  ingress: string | undefined
): Promise<SophiaTurnResult> {
  const cancelLog = buildDecisionLogEntry({
    turnId: cleanTurnId,
    conversationId: conversationId || '',
    query: cleanTurnId ? `[turn ${cleanTurnId}]` : '(cancelled turn)',
    route: 'converse',
    scopes: [],
    confidence: 0.0,
    outcome: 'cancelled',
    reasoning: 'Turn interrupted by client cancellation before completion.',
  });

  let assistantMessageId: string | undefined;
  if (conversationId && cleanTurnId) {
    try {
      const convStore = ConversationStore.getInstance();
      const founderMessage = await convStore.findMessageByIdempotencyKey(conversationId, cleanTurnId);
      if (founderMessage) {
        const marker = await convStore.saveMessage(
          {
            conversationId,
            sender: 'assistant',
            role: 'assistant',
            content: SOPHIA_TURN_CANCELLED_MARKER,
            idempotencyKey: `${cleanTurnId}:assistant`,
            intent: 'conversation',
            metadata: {
              cancelled: true,
              ingress: ingress ?? 'live_voice',
              decisionLog: cancelLog,
            },
          },
          founderId
        );
        assistantMessageId = marker.id;
      }
    } catch (err) {
      // Marker persistence failure must not mask the cancellation itself —
      // the turn is still cancelled; only the retry-dedupe guarantee is
      // weakened for this turn.
      console.error('[SophiaTurnExecutor] Failed to persist cancelled-turn marker:', err);
    }
  }
  return {
    success: false,
    cancelled: true,
    reply: '',
    conversationId: conversationId || '',
    assistantMessageId,
    intent: 'conversation',
    directiveExecuted: false,
    liveAi: false,
    error: 'Turn cancelled before completion',
    scopes: [],
    sources: [],
    sourceIds: [],
    decisionLog: cancelLog,
  };
}

/**
 * ============================================================================
 * UNIFIED SOPHIA TURN EXECUTOR (PHASE 4C-B / M3 K-1 canonical ingress)
 * ============================================================================
 * Canonical execution path for turns entering Sophia from any modality
 * (text chat, SOFIA typed surface, or live streaming STT).
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * 1. Audio and transcripts are UNTRUSTED DATA.
 * 2. Transcripts enter the EXACT same pipeline as text:
 *    ConversationStore -> ContextAssembler -> IntentClassifier -> ServerGateway
 * 3. ServerGateway strips any untrusted identity or credential claims.
 * 4. Idempotency: completed turns replay from durable assistant records, and
 *    same-process concurrent duplicates coalesce on the canonical turn key.
 *
 * KNOWN LIMITATION (M3 hardening review; see tests/sophia/m3_authority_hardening.test.ts
 * and the ADR 0002 addendum):
 *   When a non-empty conversationId is supplied but the conversation does not
 *   exist, this executor still provisions a fresh founder-bound conversation
 *   rather than surfacing ConversationNotFoundError (S4). This preserves the
 *   existing voice/typed-surface behavior and remains divergent from ADR 0002
 *   §7's blanket 404 contract. To prevent the prior S6 duplicate-execution
 *   bug, a missing conversation plus a supplied turnId now maps to a stable,
 *   founder- and request-scoped canonical conversation ID. Ownership mismatch
 *   still fails closed before the provisioning fallback. This is a targeted
 *   idempotency fix, not a change to the unknown-conversation policy.
 */
export async function executeSophiaTurn(opts: ExecuteSophiaTurnOptions): Promise<SophiaTurnResult> {
  const { message, founderId, conversationId, turnId, executeDirective, signal } = opts;
  const cleanMessage = message ? message.trim() : '';

  if (!cleanMessage) {
    return {
      success: false,
      reply: '',
      conversationId: conversationId || '',
      intent: 'conversation',
      directiveExecuted: false,
      liveAi: false,
      error: 'Cannot execute empty turn message',
    };
  }

  const convStore = ConversationStore.getInstance();
  const cleanConversationId =
    typeof conversationId === 'string' && conversationId.trim().length > 0
      ? conversationId.trim()
      : undefined;
  const cleanTurnId = typeof turnId === 'string' && turnId.trim().length > 0 ? turnId.trim() : undefined;

  // Phase 3 cancellation checkpoint 0 — before any resolution or persistence.
  // A turn with NO durably recorded founder message leaves no record at all
  // (a retry re-executes — it never executed); a turn whose founder message
  // IS already recorded (pre-seeded or a prior partial execution) gets the
  // cancelled assistant marker, closing the idempotency loop.
  if (signal?.aborted) {
    return cancelledTurnResult(conversationId || '', founderId, cleanTurnId, opts.ingress);
  }

  // 1. Resolve or establish durable conversation identity bound to authenticated Founder
  let conversation;
  try {
    conversation = await convStore.getOrCreateConversation({
      founderId,
      conversationId: cleanConversationId,
      agentId: 'sophia',
    });
  } catch (err: any) {
    if (err instanceof ConversationSecurityError || err.name === 'ConversationSecurityError') {
      return {
        success: false,
        reply: 'Forbidden: Access denied to conversation',
        conversationId: conversationId || '',
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
        error: `Forbidden: ${err.message}`,
      };
    }
    // S4 remains intentional: an unknown supplied conversationId gets a
    // fresh founder-bound canonical conversation instead of a 404. For a
    // retryable turn, derive that canonical ID from the authenticated founder,
    // the supplied (unknown) ID, and turnId. This makes sequential retries
    // resolve the same durable conversation so the normal assistant
    // idempotency lookup can replay the completed result. Hashing keeps the
    // caller's raw ID out of the canonical ID and bounds its length.
    try {
      const retryConversationId =
        cleanConversationId && cleanTurnId
          ? `conv-${createHash('sha256')
              .update(JSON.stringify([founderId, cleanConversationId, cleanTurnId]))
              .digest('hex')
              .slice(0, 32)}`
          : undefined;

      if (retryConversationId) {
        const existingRetryConversation = await convStore.getConversation(founderId, retryConversationId);
        conversation =
          existingRetryConversation ??
          (await convStore.createConversation({
            id: retryConversationId,
            founderId,
            agentId: 'sophia',
            title: 'Voice Executive Dialogue',
          }));
      } else {
        conversation = await convStore.createConversation({
          founderId,
          agentId: 'sophia',
          title: 'Voice Executive Dialogue',
        });
      }
    } catch (createErr: any) {
      if (createErr instanceof ConversationSecurityError || createErr.name === 'ConversationSecurityError') {
        return {
          success: false,
          reply: 'Forbidden: Access denied to conversation',
          conversationId: conversationId || '',
          intent: 'conversation',
          directiveExecuted: false,
          liveAi: false,
          error: `Forbidden: ${createErr.message}`,
        };
      }
      return {
        success: false,
        reply: 'Internal error creating conversation',
        conversationId: conversationId || '',
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
        error: createErr.message || 'Conversation creation failed',
      };
    }
  }

  const safeMode = SafeModeManager.getInstance();

  // M1.7 Stop Control / Safe Mode Guard
  if (safeMode.isFrozen()) {
    if (isResumeCommand(cleanMessage)) {
      await safeMode.confirmResume({
        founderId,
        confirmed: true,
        reason: `Voice/text resume directive: "${cleanMessage}"`,
      });
      const resumeReply = `[Sophia Vance • COO]\nSafe Mode deactivated. System has been resumed successfully by Founder confirmation.\n\nAll operations and workflows are restored.`;

      let assistantMessageRecord: ChatMessageRecord | null = null;
      try {
        await convStore.saveMessage({
          conversationId: conversation.id,
          sender: 'founder',
          role: 'user',
          content: cleanMessage,
          idempotencyKey: cleanTurnId,
        }, founderId);

        const resumeLog = buildDecisionLogEntry({
          turnId: cleanTurnId,
          conversationId: conversation.id,
          query: cleanMessage,
          route: 'converse',
          scopes: [],
          confidence: 1.0,
          outcome: 'answered',
          sources: ['SafeModeManager'],
          reasoning: 'System resumed by Founder confirmation.',
        });

        assistantMessageRecord = await convStore.saveMessage({
          conversationId: conversation.id,
          sender: 'assistant',
          role: 'assistant',
          content: resumeReply,
          idempotencyKey: cleanTurnId ? `${cleanTurnId}:assistant` : undefined,
          intent: 'conversation',
          confidence: 1.0,
          metadata: {
            liveAi: false,
            directiveExecuted: true,
            ingress: opts.ingress ?? 'live_voice',
            scopes: [],
            sources: ['SafeModeManager'],
            decisionLog: resumeLog,
          },
        }, founderId);
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist resume action:', err);
      }

      return {
        success: true,
        reply: resumeReply,
        conversationId: conversation.id,
        assistantMessageId: assistantMessageRecord?.id,
        intent: 'conversation',
        directiveExecuted: true,
        liveAi: false,
        scopes: [],
        sources: ['SafeModeManager'],
        sourceIds: [],
      };
    }

    const freezeInfo = safeMode.getFreezeStatus();
    const frozenReply = `[Sophia Vance • COO]\nSYSTEM IS FROZEN under Safe Mode / Stop Control (activated at ${freezeInfo.frozenAt || 'earlier'}).\nReason: ${freezeInfo.reason || 'Emergency stop triggered'}.\n\nAll autonomous actions, background jobs, and dialogue turns are suspended.\nTo resume normal operation, explicit Founder confirmation is required. Please say or send "confirm resume".`;

    return {
      success: false,
      reply: frozenReply,
      conversationId: conversation.id,
      intent: 'refuse',
      directiveExecuted: false,
      liveAi: false,
      error: 'System is frozen under Safe Mode / Stop Control',
      cancelled: true,
      scopes: [],
      sources: ['SafeModeManager'],
      sourceIds: [],
    };
  }

  // M1.7 Stop Control: Immediate Voice or Text "Stop" Directive
  if (isStopCommand(cleanMessage)) {
    await safeMode.triggerStop({
      source: (opts.ingress as any) || 'panel',
      reason: `Voice/text stop directive: "${cleanMessage}"`,
      founderId,
    });

    const stopReply = `[Sophia Vance • COO]\nEMERGENCY STOP ACTIVATED. All in-flight turns and scheduled workflows have been frozen.\n\nSystem is now in Safe Mode. Resuming requires explicit Founder confirmation (send "confirm resume").`;

    let assistantMessageRecord: ChatMessageRecord | null = null;
    try {
      await convStore.saveMessage({
        conversationId: conversation.id,
        sender: 'founder',
        role: 'user',
        content: cleanMessage,
        idempotencyKey: cleanTurnId,
      }, founderId);

      const stopLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'converse',
        scopes: [],
        confidence: 1.0,
        outcome: 'cancelled',
        sources: ['SafeModeManager'],
        reasoning: 'Stop control activated by Founder.',
      });

      assistantMessageRecord = await convStore.saveMessage({
        conversationId: conversation.id,
        sender: 'assistant',
        role: 'assistant',
        content: stopReply,
        idempotencyKey: cleanTurnId ? `${cleanTurnId}:assistant` : undefined,
        intent: 'stop',
        confidence: 1.0,
        metadata: {
          liveAi: false,
          directiveExecuted: true,
          cancelled: true,
          ingress: opts.ingress ?? 'live_voice',
          scopes: [],
          sources: ['SafeModeManager'],
          sourceIds: [],
          decisionLog: stopLog,
        },
      }, founderId);
    } catch (err) {
      console.error('[SophiaTurnExecutor] Failed to persist stop action:', err);
    }

    return {
      success: true,
      reply: stopReply,
      conversationId: conversation.id,
      assistantMessageId: assistantMessageRecord?.id,
      intent: 'stop',
      directiveExecuted: true,
      liveAi: false,
      cancelled: true,
      scopes: [],
      sources: ['SafeModeManager'],
      sourceIds: [],
    };
  }

  // M1.8 Spend Settings: Interactive Spend Gate
  const spendManager = SpendSettingsManager.getInstance();
  const spendCheck = spendManager.canExecuteInteractiveSpend();
  if (!spendCheck.allowed) {
    const capReachedReply = `[Sophia Vance • COO]\nMODEL SPEND CAP REACHED ($${spendCheck.currentSpendUsd.toFixed(2)} / $${(spendCheck.spendCapUsd ?? 0).toFixed(2)}).\n\nAll model operations are suspended to protect capital.\nTo adjust your limits, update the Model Spend Cap in Settings.`;

    let assistantMessageRecord: ChatMessageRecord | null = null;
    try {
      await convStore.saveMessage({
        conversationId: conversation.id,
        sender: 'founder',
        role: 'user',
        content: cleanMessage,
        idempotencyKey: cleanTurnId,
      }, founderId);

      const capLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'refuse',
        scopes: [],
        confidence: 1.0,
        outcome: 'refused',
        sources: ['SpendSettingsManager'],
        reasoning: 'Model spend cap exceeded.',
      });

      assistantMessageRecord = await convStore.saveMessage({
        conversationId: conversation.id,
        sender: 'assistant',
        role: 'assistant',
        content: capReachedReply,
        idempotencyKey: cleanTurnId ? `${cleanTurnId}:assistant` : undefined,
        intent: 'refuse',
        confidence: 1.0,
        metadata: {
          liveAi: false,
          directiveExecuted: false,
          cancelled: true,
          ingress: opts.ingress ?? 'live_voice',
          scopes: [],
          sources: ['SpendSettingsManager'],
          sourceIds: [],
          decisionLog: capLog,
        },
      }, founderId);
    } catch (err) {
      console.error('[SophiaTurnExecutor] Failed to persist spend cap refusal:', err);
    }

    return {
      success: false,
      reply: capReachedReply,
      conversationId: conversation.id,
      assistantMessageId: assistantMessageRecord?.id,
      intent: 'refuse',
      directiveExecuted: false,
      liveAi: false,
      error: 'Model spend cap reached',
      cancelled: true,
      scopes: [],
      sources: ['SpendSettingsManager'],
      sourceIds: [],
    };
  }

  // Phase 3 cancellation checkpoint 1 — after conversation resolution, before
  // the replay lookup: an aborted caller wants no reply, replayed or not.
  if (signal?.aborted) {
    return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
  }

  // 2. Turn-Level Idempotency Check: if this turn was already completed, return cached assistant message
  if (cleanTurnId) {
    const existingAssistantMessage = await convStore.findMessageByIdempotencyKey(
      conversation.id,
      `${cleanTurnId}:assistant`
    );
    if (existingAssistantMessage) {
      return {
        success: true,
        reply: existingAssistantMessage.content,
        conversationId: conversation.id,
        assistantMessageId: existingAssistantMessage.id,
        intent: existingAssistantMessage.intent || 'conversation',
        directiveExecuted: existingAssistantMessage.metadata?.directiveExecuted ?? false,
        liveAi: existingAssistantMessage.metadata?.liveAi ?? false,
        metrics: existingAssistantMessage.metadata?.metrics,
        idempotentReplay: true,
        // A previously cancelled turn replays as cancelled — callers must not
        // present the marker as a live reply (Phase 3).
        cancelled: existingAssistantMessage.metadata?.cancelled === true,
        scopes: existingAssistantMessage.metadata?.scopes,
        sources: existingAssistantMessage.metadata?.sources,
        sourceIds: existingAssistantMessage.metadata?.sourceIds,
        decisionLog: existingAssistantMessage.metadata?.decisionLog,
      };
    }
  }

  // 3. In-flight Concurrency Lock for duplicate turns
  const turnKey = cleanTurnId ? `${founderId}:${conversation.id}:${cleanTurnId}` : null;
  if (turnKey && inFlightTurns.has(turnKey)) {
    return inFlightTurns.get(turnKey)!;
  }

  const executeCore = async (): Promise<SophiaTurnResult> => {
    const internalController = new AbortController();
    if (signal) {
      if (signal.aborted) {
        internalController.abort();
      } else {
        signal.addEventListener('abort', () => internalController.abort(), { once: true });
      }
    }
    const safeModeKey = cleanTurnId || `turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    safeMode.registerInFlightTurn(safeModeKey, internalController);

    try {
      // Phase 3 cancellation checkpoint 2 — before founder-message persistence:
      // cancelled turns leave no conversation record (retry re-executes).
      if (signal?.aborted || internalController.signal.aborted) {
        return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
      }

    // 4. Persist incoming Founder turn with idempotency key
    let founderMessageRecord;
    try {
      founderMessageRecord = await convStore.saveMessage(
        {
          conversationId: conversation.id,
          sender: 'founder',
          role: 'user',
          content: cleanMessage,
          idempotencyKey: cleanTurnId,
        },
        founderId
      );
    } catch (err: any) {
      return {
        success: false,
        reply: 'Failed to persist turn',
        conversationId: conversation.id,
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
        error: err.message || 'Failed to persist turn',
      };
    }

    // Phase 3 cancellation checkpoint 3 — after founder-message persistence,
    // before history/context/intent/gateway: from here on, cancellation
    // persists the assistant cancelled-marker (retry replays the cancel).
    if (signal?.aborted) {
      return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
    }

    // Explanation Query Check (M1.6 / G12.6):
    // If the founder asks "why did you do that" (or equivalent explanation query),
    // cite the previous turn's decision log entry directly from ConversationStore.
    if (isExplanationQuery(cleanMessage)) {
      const priorLog = await convStore.getLatestDecisionLog(conversation.id, founderId);
      const explanationReply = priorLog
        ? formatDecisionLogExplanation(priorLog)
        : formatNoDecisionLogExplanation();

      const explanationLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'converse',
        scopes: [],
        confidence: 1.0,
        outcome: 'answered',
        sources: priorLog ? [`DecisionLog:${priorLog.id}`] : [],
        reasoning: priorLog
          ? `Cited decision log entry [${priorLog.id}] to explain prior turn.`
          : 'Abstained from explanation because no prior decision log entry exists in session.',
      });

      let assistantMessageRecord: ChatMessageRecord | null = null;
      try {
        const assistantIdempotencyKey = cleanTurnId ? `${cleanTurnId}:assistant` : undefined;
        assistantMessageRecord = await convStore.saveMessage(
          {
            conversationId: conversation.id,
            sender: 'assistant',
            role: 'assistant',
            content: explanationReply,
            idempotencyKey: assistantIdempotencyKey,
            intent: 'conversation',
            confidence: 1.0,
            metadata: {
              liveAi: false,
              directiveExecuted: false,
              ingress: opts.ingress ?? 'live_voice',
              scopes: [],
              sources: priorLog ? [`DecisionLog:${priorLog.id}`] : [],
              sourceIds: priorLog ? [priorLog.id] : [],
              decisionLog: explanationLog,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist explanation assistant reply:', err);
      }

      return {
        success: true,
        reply: explanationReply,
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        assistantMessageId: assistantMessageRecord?.id,
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
        scopes: [],
        sources: priorLog ? [`DecisionLog:${priorLog.id}`] : [],
        sourceIds: priorLog ? [priorLog.id] : [],
        decisionLog: explanationLog,
      };
    }

    // 5. Server-Authoritative bounded dialogue history retrieval
    const serverHistory = await convStore.getRecentHistory(conversation.id, founderId, 10);
    const priorHistory = serverHistory.filter((h) => h.id !== founderMessageRecord.id);

    const historyItems = priorHistory.map((h) => ({
      sender: h.sender,
      text: h.text,
    }));

    // Route & Scope determination for scope-aware context partition (M1.3 / G12.3)
    let route = opts.route;
    if (!route) {
      const routeResult = await SophiaIntentClassifier.route({
        message: cleanMessage,
        history: historyItems,
      });
      route = routeResult.route;
    }

    let scope: 'all' | 'personal_only' | 'company_only' | 'none' = opts.scope ?? 'all';
    if (!opts.scope) {
      if (route === 'recall-personal') {
        scope = 'personal_only';
      } else if (route === 'recall-company') {
        scope = 'company_only';
      } else if (route === 'converse' || route === 'refuse') {
        scope = 'none';
      } else {
        scope = 'company_only';
      }
    }

    // 6. Context Assembly: deterministic, multi-source, authority-classified
    //    (M3 K-2 / M1.3: scope-aware context partition ensures personal memories
    //    are read ONLY for personal queries, and Company Brain ONLY for company queries.)
    const assembledContext = await SophiaContextAssembler.assemble({
      message: cleanMessage,
      history: historyItems,
      founderId,
      scope,
    });

    // Check for Personal Mind empty result (M1.3: honest abstention)
    const personalSlice = assembledContext.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');
    const hasPersonalMemory = personalSlice && personalSlice.content.includes('<personal_memory');

    if (route === 'recall-personal' && !hasPersonalMemory) {
      const persona = 'Sophia Vance • COO';
      const abstainReply = `[${persona}]\nI do not remember any personal notes or preferences regarding that.\n\n[Scopes: personal_mind | Sources: SophiaMemoryStore]`;

      const abstainLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'recall-personal',
        scopes: ['personal_mind'],
        confidence: 0.9,
        outcome: 'answered',
        sources: ['SophiaMemoryStore'],
        reasoning: 'Personal memory query with no matching facts abstained honestly.',
      });

      let assistantMessageRecord: ChatMessageRecord | null = null;
      try {
        const assistantIdempotencyKey = cleanTurnId ? `${cleanTurnId}:assistant` : undefined;
        assistantMessageRecord = await convStore.saveMessage(
          {
            conversationId: conversation.id,
            sender: 'assistant',
            role: 'assistant',
            content: abstainReply,
            idempotencyKey: assistantIdempotencyKey,
            intent: 'informational_query',
            confidence: 0.9,
            metadata: {
              liveAi: false,
              directiveExecuted: false,
              ingress: opts.ingress ?? 'live_voice',
              scopes: ['personal_mind'],
              sources: ['SophiaMemoryStore'],
              sourceIds: [],
              decisionLog: abstainLog,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist assistant abstain reply:', err);
      }

      return {
        success: true,
        reply: abstainReply,
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        assistantMessageId: assistantMessageRecord?.id,
        intent: 'informational_query',
        directiveExecuted: false,
        liveAi: false,
        scopes: ['personal_mind'],
        sources: ['SophiaMemoryStore'],
        sourceIds: [],
        decisionLog: abstainLog,
      };
    }

    // Check for Company Brain empty result (M1.3: honest abstention)
    const hasKnowledgeSlice = assembledContext.slices.some((s) => s.authority === 'COMPANY_KNOWLEDGE');
    const hasPrecedentSlice = assembledContext.slices.some((s) => s.authority === 'HISTORICAL_PRECEDENT');
    const canonicalFactSlice = assembledContext.slices.find((s) => s.authority === 'CANONICAL_FACT');
    const hasMatchedFact = canonicalFactSlice && !canonicalFactSlice.content.includes('(no query match');
    const isMetricsQuery = /\b(mrr|burn|burn rate|runway|gross margin|cash|revenue|financial|arr)\b/i.test(cleanMessage);
    const hasCompanyKnowledge = hasKnowledgeSlice || hasPrecedentSlice || hasMatchedFact || isMetricsQuery || assembledContext.retrievalHit;

    if (route === 'recall-company' && !hasCompanyKnowledge) {
      const persona = 'Sophia Vance • COO';
      const abstainReply = `[${persona}]\nI do not remember or have any recorded facts or guidelines regarding that in the Company Brain.\n\n[Scopes: company_brain | Sources: CompanyKnowledgeStore]`;

      const abstainLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'recall-company',
        scopes: ['company_brain'],
        confidence: 0.9,
        outcome: 'answered',
        sources: ['CompanyKnowledgeStore'],
        reasoning: 'Company Brain query with no matching facts or knowledge abstained honestly.',
      });

      let assistantMessageRecord: ChatMessageRecord | null = null;
      try {
        const assistantIdempotencyKey = cleanTurnId ? `${cleanTurnId}:assistant` : undefined;
        assistantMessageRecord = await convStore.saveMessage(
          {
            conversationId: conversation.id,
            sender: 'assistant',
            role: 'assistant',
            content: abstainReply,
            idempotencyKey: assistantIdempotencyKey,
            intent: 'informational_query',
            confidence: 0.9,
            metadata: {
              liveAi: false,
              directiveExecuted: false,
              ingress: opts.ingress ?? 'live_voice',
              scopes: ['company_brain'],
              sources: ['CompanyKnowledgeStore'],
              sourceIds: [],
              decisionLog: abstainLog,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist assistant abstain reply:', err);
      }

      return {
        success: true,
        reply: abstainReply,
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        assistantMessageId: assistantMessageRecord?.id,
        intent: 'informational_query',
        directiveExecuted: false,
        liveAi: false,
        scopes: ['company_brain'],
        sources: ['CompanyKnowledgeStore'],
        sourceIds: [],
        decisionLog: abstainLog,
      };
    }

    // 7. Intent Classification with structural trust boundary
    const classificationResult = await SophiaIntentClassifier.classify({
      message: cleanMessage,
      context: assembledContext,
      history: historyItems,
    });

    // 8. Server Trust Boundary Gateway: Verify principal, evaluate policy, enforce invariants, dispatch
    const session = {
      role: 'FOUNDER',
      founderId,
      userId: founderId,
    };

    const executionPromise = SophiaServerGateway.process({
      proposal: classificationResult.proposal,
      session,
      message: cleanMessage,
      context: assembledContext,
      executeDirective: executeDirective !== false, // Live interaction default: execute authorized directives
      liveAi: classificationResult.liveAi,
    });

    const abortPromise = new Promise<never>((_, reject) => {
      if (internalController.signal.aborted || signal?.aborted) {
        reject(new Error('Turn aborted by stop control'));
      } else {
        const onAbort = () => reject(new Error('Turn aborted by stop control'));
        internalController.signal.addEventListener('abort', onAbort, { once: true });
        signal?.addEventListener('abort', onAbort, { once: true });
      }
    });

    let executionResult: any;
    try {
      executionResult = await Promise.race([executionPromise, abortPromise]);
    } catch (err: any) {
      if (internalController.signal.aborted || signal?.aborted) {
        return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
      }
      throw err;
    }

    if (signal?.aborted || internalController.signal.aborted) {
      return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
    }

    if (!executionResult.success && executionResult.error?.includes('Forbidden')) {
      const returnScopes: MemoryScope[] = executionResult.scopes ?? assembledContext.scopes ?? [];
      const returnSources: string[] = executionResult.sources ?? assembledContext.sources ?? [];
      const returnSourceIds: string[] = executionResult.sourceIds ?? assembledContext.sourceIds ?? [];
      const refuseLog = buildDecisionLogEntry({
        turnId: cleanTurnId,
        conversationId: conversation.id,
        query: cleanMessage,
        route: 'refuse',
        scopes: returnScopes,
        confidence: 1.0,
        outcome: 'refused',
        sources: returnSources,
        reasoning: executionResult.error || 'Request refused under governance policy.',
      });

      let assistantMessageRecord: ChatMessageRecord | null = null;
      try {
        const assistantIdempotencyKey = cleanTurnId ? `${cleanTurnId}:assistant` : undefined;
        assistantMessageRecord = await convStore.saveMessage(
          {
            conversationId: conversation.id,
            sender: 'assistant',
            role: 'assistant',
            content: executionResult.reply || 'Forbidden',
            idempotencyKey: assistantIdempotencyKey,
            intent: 'refuse',
            confidence: 1.0,
            metadata: {
              liveAi: false,
              directiveExecuted: false,
              ingress: opts.ingress ?? 'live_voice',
              scopes: returnScopes,
              sources: returnSources,
              sourceIds: returnSourceIds,
              decisionLog: refuseLog,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist forbidden assistant reply:', err);
      }

      return {
        success: false,
        reply: executionResult.reply || 'Forbidden',
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        assistantMessageId: assistantMessageRecord?.id,
        intent: 'refuse',
        directiveExecuted: false,
        liveAi: false,
        error: executionResult.error,
        scopes: returnScopes,
        sources: returnSources,
        sourceIds: returnSourceIds,
        decisionLog: refuseLog,
      };
    }

    // Phase 3 cancellation checkpoint 4 — after the trust-boundary gateway,
    // before assistant persistence and memory capture: a reply computed but
    // not yet delivered is discarded; the cancelled marker records the
    // interruption instead. (The gateway call itself runs to completion —
    // see ExecuteSophiaTurnOptions.signal for the documented limitation.)
    if (signal?.aborted || internalController.signal.aborted) {
      return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
    }

    const returnScopes: MemoryScope[] = executionResult.scopes ?? assembledContext.scopes ?? [];
    const returnSources: string[] = executionResult.sources ?? assembledContext.sources ?? [];
    const returnSourceIds: string[] = executionResult.sourceIds ?? assembledContext.sourceIds ?? [];

    const outcome: DecisionOutcome =
      executionResult.proposal.kind === 'refuse' || route === 'refuse'
        ? 'refused'
        : executionResult.proposal.kind === 'clarification_prompt' || route === 'ask-clarify'
        ? 'clarification_requested'
        : executionResult.success
        ? 'answered'
        : 'error';

    const decisionLog = buildDecisionLogEntry({
      turnId: cleanTurnId,
      conversationId: conversation.id,
      query: cleanMessage,
      route,
      scopes: returnScopes,
      confidence: classificationResult.proposal.confidence,
      outcome,
      sources: returnSources,
      reasoning: classificationResult.proposal.reason || `Processed turn with route ${route}`,
    });

    // 9. Persist assistant turn to durable storage with assistant idempotency key
    //    (M4-A note: explicit ChatMessageRecord | null typing — the capture
    //    stage below reads assistantMessageRecord?.id, so the historic
    //    implicit-null narrowing quirk is closed here with a pure annotation.)
    let assistantMessageRecord: ChatMessageRecord | null = null;
    if (executionResult.reply) {
      try {
        const assistantIdempotencyKey = cleanTurnId ? `${cleanTurnId}:assistant` : undefined;
        assistantMessageRecord = await convStore.saveMessage(
          {
            conversationId: conversation.id,
            sender: 'assistant',
            role: 'assistant',
            content: executionResult.reply,
            idempotencyKey: assistantIdempotencyKey,
            intent: executionResult.proposal.kind,
            confidence: classificationResult.proposal.confidence,
            metadata: {
              liveAi: executionResult.liveAi,
              directiveExecuted: executionResult.directiveExecuted,
              metrics: executionResult.metrics,
              voiceIngress: (opts.ingress ?? 'live_voice') !== 'sofia_ask',
              ingress: opts.ingress ?? 'live_voice',
              scopes: returnScopes,
              sources: returnSources,
              sourceIds: returnSourceIds,
              decisionLog,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist assistant reply:', err);
      }
    }

    // 10. M4-A Personal Mind capture (fire-and-forget — NEVER a conversational
    //     dependency): after the assistant reply is durably persisted, an
    //     asynchronous capture stage proposes personal-memory candidates
    //     through the deterministic MemoryGate. Only NEEDS_REVIEW candidates
    //     persist, INACTIVE, pending explicit Founder confirmation via the
    //     governed /api/sofia/memory PATCH. Capture failures are contained
    //     inside the stage and can never fail this turn; a replayed turn
    //     returns at the idempotency check above before ever reaching here.
    if (executionResult.success && executionResult.reply && founderMessageRecord) {
      scheduleSophiaMemoryCapture({
        founderId,
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        assistantMessageId: assistantMessageRecord?.id,
        turnId: cleanTurnId,
        founderMessage: cleanMessage,
        assistantReply: executionResult.reply,
        ingress: opts.ingress ?? 'live_voice',
      });
    }

    // M1.8 Spend Settings: Count interactive model spend
    if (executionResult.success) {
      spendManager.recordSpend({
        amountUsd: 0.002,
        type: 'interactive',
        turnId: cleanTurnId,
      });
    }

    let finalReply = executionResult.reply;
    if (finalReply && returnScopes.length > 0 && !finalReply.includes('Scopes:')) {
      finalReply += `\n\n[Scopes: ${returnScopes.join(', ')} | Sources: ${returnSources.join(', ') || 'none'}]`;
    }

    return {
      success: executionResult.success,
      reply: finalReply,
      conversationId: conversation.id,
      founderMessageId: founderMessageRecord.id,
      assistantMessageId: assistantMessageRecord?.id,
      intent: executionResult.proposal.kind,
      directiveExecuted: executionResult.directiveExecuted,
      liveAi: executionResult.liveAi,
      metrics: executionResult.metrics,
      error: executionResult.error,
      scopes: returnScopes,
      sources: returnSources,
      sourceIds: returnSourceIds,
      decisionLog,
    };
    } finally {
      safeMode.unregisterInFlightTurn(safeModeKey);
    }
  };

  if (turnKey) {
    const promise = executeCore().finally(() => {
      inFlightTurns.delete(turnKey);
    });
    inFlightTurns.set(turnKey, promise);
    return promise;
  }

  return executeCore();
}
