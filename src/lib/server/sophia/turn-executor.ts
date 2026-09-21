import { ConversationStore, ConversationSecurityError, ConversationNotFoundError } from '../conversation';
import { SophiaContextAssembler } from './context-assembly';
import { SophiaIntentClassifier } from './intent-classifier';
import { SophiaServerGateway } from './server-gateway';
import { SERVER_AGENTS } from '../agents/definitions';

export interface ExecuteSophiaTurnOptions {
  message: string;
  founderId: string;
  conversationId?: string;
  turnId?: string;
  executeDirective?: boolean;
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
 * UNIFIED SOPHIA TURN EXECUTOR (PHASE 4C-B)
 * ============================================================================
 * Canonical execution path for turns entering Sophia from any modality
 * (text chat or live streaming STT).
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * 1. Audio and transcripts are UNTRUSTED DATA.
 * 2. Transcripts enter the EXACT same pipeline as text:
 *    ConversationStore -> ContextAssembler -> IntentClassifier -> ServerGateway
 * 3. ServerGateway strips any untrusted identity or credential claims.
 * 4. Idempotency guarantees: exactly-once execution per turnId.
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

  // 1. Resolve or establish durable conversation identity bound to authenticated Founder
  let conversation;
  try {
    conversation = await convStore.getOrCreateConversation({
      founderId,
      conversationId: typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : undefined,
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
    // If specified conversation not found, provision fresh conversation bound to this founder
    try {
      conversation = await convStore.createConversation({
        founderId,
        agentId: 'sophia',
        title: 'Voice Executive Dialogue',
      });
    } catch (createErr: any) {
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

  const cleanTurnId = typeof turnId === 'string' && turnId.trim().length > 0 ? turnId.trim() : undefined;

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
    const assembledContext = await SophiaContextAssembler.assemble({
      message: cleanMessage,
      history: historyItems,
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
    let assistantMessageRecord = null;
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
              voiceIngress: true,
            },
          },
          founderId
        );
      } catch (err) {
        console.error('[SophiaTurnExecutor] Failed to persist assistant reply:', err);
      }
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
