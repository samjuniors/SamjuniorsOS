import { createHash } from 'crypto';
import { ConversationStore, ConversationSecurityError, ChatMessageRecord } from '../conversation';
import { SophiaContextAssembler } from './context-assembly';
import { SophiaIntentClassifier } from './intent-classifier';
import { SophiaServerGateway } from './server-gateway';
import { scheduleSophiaMemoryCapture } from './memory-capture-stage';

export interface ExecuteSophiaTurnOptions {
  message: string;
  founderId: string;
  conversationId?: string;
  turnId?: string;
  executeDirective?: boolean;
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
      };
    }
  }

  // 3. In-flight Concurrency Lock for duplicate turns
  const turnKey = cleanTurnId ? `${founderId}:${conversation.id}:${cleanTurnId}` : null;
  if (turnKey && inFlightTurns.has(turnKey)) {
    return inFlightTurns.get(turnKey)!;
  }

  const executeCore = async (): Promise<SophiaTurnResult> => {
    // Phase 3 cancellation checkpoint 2 — before founder-message persistence:
    // cancelled turns leave no conversation record (retry re-executes).
    if (signal?.aborted) {
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

    // 5. Server-Authoritative bounded dialogue history retrieval
    const serverHistory = await convStore.getRecentHistory(conversation.id, founderId, 10);
    const priorHistory = serverHistory.filter((h) => h.id !== founderMessageRecord.id);

    const historyItems = priorHistory.map((h) => ({
      sender: h.sender,
      text: h.text,
    }));

    // 6. Context Assembly: deterministic, multi-source, authority-classified
    //    (M3 K-2: the authenticated founder principal threads through so the
    //    founder-scoped PERSONAL_MIND_MEMORY slice renders for THIS founder
    //    only — personal context, never company authority.)
    const assembledContext = await SophiaContextAssembler.assemble({
      message: cleanMessage,
      history: historyItems,
      founderId,
    });

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

    const executionResult = await SophiaServerGateway.process({
      proposal: classificationResult.proposal,
      session,
      message: cleanMessage,
      context: assembledContext,
      executeDirective: executeDirective !== false, // Live interaction default: execute authorized directives
    });

    if (!executionResult.success && executionResult.error?.includes('Forbidden')) {
      return {
        success: false,
        reply: executionResult.reply || 'Forbidden',
        conversationId: conversation.id,
        founderMessageId: founderMessageRecord.id,
        intent: 'conversation',
        directiveExecuted: false,
        liveAi: false,
        error: executionResult.error,
      };
    }

    // Phase 3 cancellation checkpoint 4 — after the trust-boundary gateway,
    // before assistant persistence and memory capture: a reply computed but
    // not yet delivered is discarded; the cancelled marker records the
    // interruption instead. (The gateway call itself runs to completion —
    // see ExecuteSophiaTurnOptions.signal for the documented limitation.)
    if (signal?.aborted) {
      return cancelledTurnResult(conversation.id, founderId, cleanTurnId, opts.ingress);
    }

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
            confidence: classificationResult.confidence,
            metadata: {
              liveAi: executionResult.liveAi,
              directiveExecuted: executionResult.directiveExecuted,
              metrics: executionResult.metrics,
              voiceIngress: (opts.ingress ?? 'live_voice') !== 'sofia_ask',
              ingress: opts.ingress ?? 'live_voice',
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

    return {
      success: executionResult.success,
      reply: executionResult.reply,
      conversationId: conversation.id,
      founderMessageId: founderMessageRecord.id,
      assistantMessageId: assistantMessageRecord?.id,
      intent: executionResult.proposal.kind,
      directiveExecuted: executionResult.directiveExecuted,
      liveAi: executionResult.liveAi,
      metrics: executionResult.metrics,
      error: executionResult.error,
    };
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
