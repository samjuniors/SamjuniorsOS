import { createHash } from 'crypto';
import { ConversationStore, ConversationSecurityError, ConversationNotFoundError, ChatMessageRecord } from '../conversation';
import { SophiaContextAssembler } from './context-assembly';
import { SophiaIntentClassifier } from './intent-classifier';
import { SophiaServerGateway } from './server-gateway';
import { scheduleSophiaMemoryCapture } from './memory-capture-stage';
import { SERVER_AGENTS } from '../agents/definitions';

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
}

// In-flight turn concurrency locks across all ingress channels
const inFlightTurns = new Map<string, Promise<SophiaTurnResult>>();

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
  const { message, founderId, conversationId, turnId, executeDirective } = opts;
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
      };
    }
  }

  // 3. In-flight Concurrency Lock for duplicate turns
  const turnKey = cleanTurnId ? `${founderId}:${conversation.id}:${cleanTurnId}` : null;
  if (turnKey && inFlightTurns.has(turnKey)) {
    return inFlightTurns.get(turnKey)!;
  }

  const executeCore = async (): Promise<SophiaTurnResult> => {
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
