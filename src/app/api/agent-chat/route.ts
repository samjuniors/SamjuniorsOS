import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/server/ai/zai-client";
import { SERVER_AGENTS } from "@/lib/server/agents/definitions";
import { AgentRole } from "@/types/os";
import { CompanyContextProvider } from "@/lib/server/context/company-context";
import { MultiAgentOrchestrator } from "@/lib/server/orchestration/orchestrator";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";
import {
  SophiaContextAssembler,
  SophiaIntentClassifier,
  SophiaServerGateway,
  TurnStopwatch,
} from "@/lib/server/sophia";
import { scheduleSophiaMemoryCapture } from "@/lib/server/sophia/memory-capture-stage";
import {
  ConversationStore,
  ConversationSecurityError,
  ConversationNotFoundError,
  ChatMessageRecord,
} from "@/lib/server/conversation";

// Module-level in-flight turns map to serialize concurrent duplicate turns
const inFlightTurns = new Map<string, Promise<any>>();

type MessageIntent = "conversation" | "information_request" | "directive" | "ambiguous" | "approval_action";

interface IntentClassification {
  intent: MessageIntent;
  confidence: number;
  directiveTitle?: string;
  reason: string;
  suggestedScope?: string;
  approvalAction?: 'approve' | 'reject' | 'request_revision';
  approvalNote?: string;
}

function classifyMessageIntent(message: string): IntentClassification {
  const clean = message.trim().toLowerCase();

  // 0. Explicit Founder Approval / Governance Action Check
  // e.g. "Approve", "Authorize this", "I approve", "Reject", "Reject the proposal", "Request revision", "Needs revision", "Send it back"
  const approvePatterns = [
    /^(i )?(approve|approved|ratify|ratified|authorize|authorized|sign off|signed off|looks good, approve|approved, proceed|proceed with this|i agree, approve)$/i,
    /^(approve|authorize|ratify)\s+(the\s+)?(decision|proposal|plan|request|recommendation|item|initiative)?$/i,
  ];

  const rejectPatterns = [
    /^(i )?(reject|rejected|decline|declined|disapprove|veto|vetoed|cancel this|do not proceed|block this)$/i,
    /^(reject|decline|disapprove|veto)\s+(the\s+)?(decision|proposal|plan|request|recommendation|item|initiative)?/i,
  ];

  const revisionPatterns = [
    /^(i )?(request revision|needs revision|revise this|send back for revision|request changes|change this|needs work|revision required)$/i,
    /^(request revision|revise|request changes)\s+(on|for|the)?/i,
  ];

  if (approvePatterns.some((p) => p.test(clean))) {
    return {
      intent: "approval_action",
      confidence: 0.98,
      approvalAction: "approve",
      reason: "Explicit Founder approval command targeting governance / pending decisions.",
    };
  }

  if (rejectPatterns.some((p) => p.test(clean))) {
    return {
      intent: "approval_action",
      confidence: 0.98,
      approvalAction: "reject",
      approvalNote: message,
      reason: "Explicit Founder rejection command targeting governance / pending decisions.",
    };
  }

  if (revisionPatterns.some((p) => p.test(clean))) {
    return {
      intent: "approval_action",
      confidence: 0.96,
      approvalAction: "request_revision",
      approvalNote: message,
      reason: "Explicit Founder revision request targeting governance / pending decisions.",
    };
  }

  // 1. Ambiguous pattern check (e.g., "Can you look into this?", "Look into pricing", "Check this out")
  const ambiguousPatterns = [
    /^(can you |could you |please |hey )?(look into|check into|check out|see about|explore|look at)\s+(this|that|it|things|something)(\?)?$/i,
    /^(can you |could you )?(look into|check out|explore)\s+[a-z0-9\s]{1,25}\?*$/i,
    /^(what should we do about|any thoughts on|what about|should we do something with)\s+[a-z0-9\s]{1,30}\?*$/i,
    /^(can you help me with this|help with this|take a look)\?*$/i,
  ];

  if (ambiguousPatterns.some((p) => p.test(clean))) {
    return {
      intent: "ambiguous",
      confidence: 0.88,
      directiveTitle: message.length > 50 ? message.slice(0, 48) + "..." : message,
      suggestedScope: "Clarification needed: determine whether to perform an informal review or initiate a formal multi-agent task.",
      reason: "Ambiguous query requesting investigation without defined deliverables, scope, or clear action boundaries.",
    };
  }

  // 2. Explicit directive patterns (Commands to perform work, create PRDs, conduct research, model economics)
  const explicitDirectivePatterns = [
    /\b(research|investigate|analyze|evaluate|audit|model|draft|design|create|build|prepare|synthesize|simulate|spec|spec out)\b.+\b(and (give|provide|recommend|write|report|present|model)|recommendation|proposal|prd|spec|plan|deliverable|architecture|breakdown|forecast|strategy)\b/i,
    /^(research|investigate|analyze|evaluate|audit|model|draft|design|create|build|prepare|synthesize|simulate)\s+(the|our|a|an|all)\s+/i,
    /\b(give me a recommendation|give me a plan|create a prd|draft a prd|model the unit economics|model our pricing|audit compute burn|conduct a research|run an analysis|synthesize a proposal)\b/i,
    /^(execute|orchestrate|launch task|run task|start initiative)\b/i,
  ];

  if (explicitDirectivePatterns.some((p) => p.test(clean))) {
    return {
      intent: "directive",
      confidence: 0.94,
      directiveTitle: message.length > 60 ? message.slice(0, 58) + "..." : message,
      suggestedScope: "Formal multi-agent task execution across Research, Product, and Finance with verified deliverables.",
      reason: "Explicit work directive requesting research, specification, financial modeling, or strategic recommendations.",
    };
  }

  // 3. Information request patterns (Queries about existing facts, MRR, initiatives, past findings)
  const infoPatterns = [
    /^(what (is|are|did|was|were)|how (much|many|is|are)|who (is|are)|where (is|are)|when (is|are)|tell me about|show me|status of|update on|do we have|is there|summary of)\b/i,
    /\b(what did you find|what are our numbers|what is the mrr|what is the burn rate|what initiatives are active)\b/i,
  ];

  if (infoPatterns.some((p) => p.test(clean))) {
    return {
      intent: "information_request",
      confidence: 0.9,
      reason: "Direct factual query referencing existing company state, deliverables, or role-scoped context.",
    };
  }

  // 4. Standard conversational patterns (Greetings, remarks, casual check-ins)
  const conversationPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|how's it going|how are things|how is everything|thanks|thank you|great work|sounds good|ok|okay|cool|nice|who are you)\b/i,
  ];

  if (conversationPatterns.some((p) => p.test(clean))) {
    return {
      intent: "conversation",
      confidence: 0.92,
      reason: "Casual dialogue, greeting, or informal check-in.",
    };
  }

  // Fallback heuristic: check for imperative verb starts
  if (/^(prepare|research|analyze|build|create|model|draft|evaluate|audit|generate)\b/i.test(clean)) {
    return {
      intent: "directive",
      confidence: 0.85,
      directiveTitle: message.length > 60 ? message.slice(0, 58) + "..." : message,
      suggestedScope: "Imperative work command requesting analytical or strategic outputs.",
      reason: "Imperative directive verb detected.",
    };
  }

  return {
    intent: "conversation",
    confidence: 0.75,
    reason: "Standard conversational exchange.",
  };
}

const ADVISOR_PERSONA = {
  id: "advisor" as const,
  name: "Founder Intelligence",
  role: "Strategic Co-Pilot & Advisor",
  department: "Founder Strategic Advisory",
  systemInstruction: `You are Founder Intelligence, the strategic cognitive co-pilot of SamJuniors OS.
You advise the Founder directly on executive strategy, governance, unit economics, market signals, risk trade-offs, and company building.
Communicate with sharp executive conciseness, epistemic clarity, and high-leverage strategic insight.
Never fabricate imaginary financial metrics or unverified operational claims. Address the Founder directly in 1:1 conversation.`,
  allowedCapabilities: [
    "High-level strategic synthesis & prioritization",
    "Trade-off and risk matrix evaluation",
    "Company governance & decision auditing",
    "Unit economics stress-testing",
  ],
  prohibitedActions: [
    "Fabricating fake accounting records or fictitious customer logos",
    "Making authoritative operational commitments without Founder consent",
    "Exposing system credentials, secrets, or internal keys",
  ],
};

export async function POST(req: NextRequest) {
  console.log('[AGENT-CHAT ENTER]');
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required to communicate with executive agents' },
        { status: 401 }
      );
    }

    const {
      agentId,
      message,
      history,
      contextSnapshot,
      executeDirective,
      personaConfig,
      conversationId,
      idempotencyKey,
    } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 });
    }

    if (executeDirective && session.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Forbidden: Only verified Founder can trigger autonomous directive execution' },
        { status: 403 }
      );
    }

    const tone = (personaConfig?.tone || 'professional') as 'professional' | 'casual' | 'flirty';

    // =========================================================================
    // SOPHIA CONVERSATIONAL EXECUTIVE PIPELINE (PHASE 1 + PHASE 3 PERSISTENCE)
    // =========================================================================
    const isSophia = agentId === "coo" || agentId === "sophia";
    if (isSophia) {
      const convStore = ConversationStore.getInstance();

      // 1. Resolve or establish durable conversation identity bound to authenticated Founder
      let conversation;
      try {
        conversation = await convStore.getOrCreateConversation({
          founderId: session.userId,
          conversationId: typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : undefined,
          agentId: 'sophia',
        });
      } catch (err: any) {
        if (err instanceof ConversationSecurityError || err.name === 'ConversationSecurityError') {
          return NextResponse.json({ error: `Forbidden: ${err.message}` }, { status: 403 });
        }
        if (err instanceof ConversationNotFoundError || err.name === 'ConversationNotFoundError') {
          return NextResponse.json({ error: `Not Found: ${err.message}` }, { status: 404 });
        }
        return NextResponse.json({ error: err.message || 'Conversation resolution failed' }, { status: 500 });
      }

      // Check if this turn was already completed (idempotent replay)
      const cleanIdempotencyKey = typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0
        ? idempotencyKey.trim()
        : undefined;

      if (cleanIdempotencyKey) {
        const existingAssistantMessage = await convStore.findMessageByIdempotencyKey(
          conversation.id,
          `${cleanIdempotencyKey}:assistant`
        );
        if (existingAssistantMessage) {
          return NextResponse.json({
            success: true,
            agentId: SERVER_AGENTS.coo.id,
            name: SERVER_AGENTS.coo.name,
            role: SERVER_AGENTS.coo.role,
            conversationId: conversation.id,
            messageId: existingAssistantMessage.id,
            intent: existingAssistantMessage.intent || 'conversation',
            classification: {
              intent: existingAssistantMessage.intent || 'conversation',
              confidence: existingAssistantMessage.confidence ?? 1.0,
              reason: 'Idempotent turn replay',
            },
            reply: existingAssistantMessage.content,
            liveAi: existingAssistantMessage.metadata?.liveAi ?? false,
            // Replay metrics: all-zero latencies are truthful — a replayed
            // turn performs no assembly/model/gateway work. estimatedTokens
            // carries the ORIGINAL turn's persisted estimates (absent only
            // for messages persisted before the R3 honest-metrics change).
            metrics: {
              contextAssemblyMs: 0,
              modelMs: 0,
              gatewayValidationMs: 0,
              totalTurnMs: 0,
              estimatedTokens: existingAssistantMessage.metadata?.tokens || { input: 0, output: 0 },
            },
            directiveExecuted: existingAssistantMessage.metadata?.directiveExecuted ?? false,
            idempotentReplay: true,
          });
        }
      }

      // Concurrency lock for duplicate in-flight turns
      const turnKey = cleanIdempotencyKey ? `${session.userId}:${conversation.id}:${cleanIdempotencyKey}` : null;
      if (turnKey && inFlightTurns.has(turnKey)) {
        const cached = await inFlightTurns.get(turnKey)!;
        return NextResponse.json(cached.data, { status: cached.status || 200 });
      }

      const executeTurn = async (): Promise<{ status?: number; data: any }> => {
        // R3 honest metrics: one TurnStopwatch per live turn. Only phases
        // with a genuine wall-clock measurement at THIS route boundary are
        // reported; values that cannot be honestly attributed here
        // (gateway validation — inseparable from directive dispatch inside
        // SophiaServerGateway.process — and retrieval — which happens
        // inside context assembly) are omitted, never fabricated.
        const stopwatch = new TurnStopwatch();
        // 2. Persist incoming Founder turn (with deduplication / idempotencyKey)
        let founderMessageRecord;
        try {
          founderMessageRecord = await convStore.saveMessage(
            {
              conversationId: conversation.id,
              sender: 'founder',
              role: 'user',
              content: message,
              idempotencyKey: cleanIdempotencyKey,
            },
            session.userId
          );
        } catch (err: any) {
          if (err instanceof ConversationSecurityError || err.name === 'ConversationSecurityError') {
            return { status: 403, data: { error: `Forbidden: ${err.message}` } };
          }
          return { status: 500, data: { error: err.message || 'Failed to persist turn' } };
        }

        // 3. Server-authoritative history retrieval: fetch recent bounded dialogue history
        const serverHistory = await convStore.getRecentHistory(conversation.id, session.userId, 10);
        const priorHistory = serverHistory.filter((h) => h.id !== founderMessageRecord.id);

        const hasExplicitConversation = typeof conversationId === 'string' && conversationId.trim().length > 0;

        const historyItems = priorHistory.length > 0
          ? priorHistory.map((h) => ({
              sender: h.sender,
              text: h.text,
            }))
          : !hasExplicitConversation && Array.isArray(history)
            ? history
                .filter((h: any) => h && (typeof h.text === "string" || typeof h.content === "string"))
                .map((h: any) => ({
                  sender: h.sender === "founder" || h.role === "user" ? ("founder" as const) : ("assistant" as const),
                  text: (h.text || h.content || "") as string,
                }))
            : [];

        // 4. Context Assembly: deterministic, multi-source, authority-classified
        //    (M3 K-2: threads the authenticated session principal so the
        //    founder-scoped PERSONAL_MIND_MEMORY slice renders for THIS
        //    founder only — personal context, never company authority.)
        const assemblyStartedAt = Date.now();
        const assembledContext = await SophiaContextAssembler.assemble({
          message,
          history: historyItems,
          founderId: session.userId,
        });
        stopwatch.recordContextAssembly(
          Date.now() - assemblyStartedAt,
          assembledContext.formattedContext.length
        );

        // 5. Cognitive Ingress: Contextual semantic intent classification with structural trust boundary
        const classificationStartedAt = Date.now();
        const classificationResult = await SophiaIntentClassifier.classify({
          message,
          context: assembledContext,
          history: historyItems,
          tone,
          customPrompt: personaConfig?.customPrompt,
        });
        const classificationMs = Date.now() - classificationStartedAt;

        // 6. Server Trust Boundary Gateway: Verify principal, evaluate policy, enforce invariants, dispatch
        const executionResult = await SophiaServerGateway.process({
          proposal: classificationResult.proposal,
          session,
          message,
          context: assembledContext,
          executeDirective: !!executeDirective,
        });

        if (!executionResult.success && executionResult.error?.includes('Forbidden')) {
          return { status: 403, data: { error: executionResult.error } };
        }

        // R3 honest metrics — model phase: the intent-classification model
        // call this route owns (the same call that drafts the conversational
        // reply). Directive-execution model time inside the gateway is NOT
        // included — it cannot be separated from validation/dispatch at this
        // boundary, so it is omitted (undercounted, never fabricated).
        stopwatch.recordModel(
          classificationMs,
          typeof message === 'string' ? message.length : String(message ?? '').length,
          (executionResult.reply ?? '').length
        );
        // Finalized at the reply boundary: totalTurnMs measures the turn's
        // reasoning pipeline (persistence + assembly + classification +
        // gateway dispatch), before response persistence bookkeeping.
        const finalizedMetrics = stopwatch.finalize();
        // Measured fields only. gatewayValidationMs and retrievalMs are
        // deliberately ABSENT: not measurable at this boundary without
        // misattributing gateway dispatch or assembly-internal retrieval.
        // retrievalHit / degradedStores flow from assembly's own signals.
        const turnMetrics = {
          contextAssemblyMs: finalizedMetrics.contextAssemblyMs,
          modelMs: finalizedMetrics.modelMs,
          totalTurnMs: finalizedMetrics.totalTurnMs,
          estimatedTokens: finalizedMetrics.estimatedTokens,
          retrievalHit: assembledContext.retrievalHit === true,
          ...(assembledContext.degradedStores
            ? { degradedStores: assembledContext.degradedStores }
            : {}),
        };

        const mapKindToIntent = (kind: string): MessageIntent => {
          switch (kind) {
            case 'conversation': return 'conversation';
            case 'informational_query': return 'information_request';
            case 'directive_proposal':
            case 'steering_proposal':
            case 'operational_inspection': return 'directive';
            case 'approval_proposal': return 'approval_action';
            case 'clarification_prompt': return 'ambiguous';
            default: return 'conversation';
          }
        };

        const resolvedIntent = executionResult.validatedCommand.type === 'PRESENT_CLARIFICATION'
          ? 'ambiguous'
          : mapKindToIntent(executionResult.proposal.kind);

        // 7. Persist assistant turn to durable storage with assistantIdempotencyKey
        //    (M4-A note: explicit ChatMessageRecord | null typing — the capture
        //    stage below reads assistantMessageRecord?.id, so the historic
        //    implicit-null narrowing quirk is closed here with a pure
        //    annotation; zero runtime change.)
        let assistantMessageRecord: ChatMessageRecord | null = null;
        if (executionResult.reply) {
          try {
            const assistantIdempotencyKey = cleanIdempotencyKey
              ? `${cleanIdempotencyKey}:assistant`
              : undefined;

            assistantMessageRecord = await convStore.saveMessage(
              {
                conversationId: conversation.id,
                sender: 'assistant',
                role: 'assistant',
                content: executionResult.reply,
                intent: resolvedIntent,
                confidence: executionResult.proposal.confidence,
                commandType: executionResult.validatedCommand.type,
                idempotencyKey: assistantIdempotencyKey,
                metadata: {
                  directiveExecuted: executionResult.directiveExecuted,
                  liveAi: executionResult.liveAi,
                  tokens: turnMetrics.estimatedTokens,
                  replyToIdempotencyKey: cleanIdempotencyKey,
                },
              },
              session.userId
            );
          } catch (err) {
            console.error('[agent-chat] Failed to persist assistant turn:', err);
          }
        }

        // 8. M4-A Personal Mind capture (fire-and-forget — NEVER a
        //     conversational dependency): after the assistant turn is
        //     durably persisted, the capture stage proposes personal-memory
        //     candidates through the deterministic MemoryGate. Only
        //     NEEDS_REVIEW candidates persist, INACTIVE, pending explicit
        //     Founder confirmation via the governed /api/sofia/memory PATCH.
        //     Capture failures are contained inside the stage and can never
        //     fail this turn; a replayed turn returns at the idempotency
        //     check above before ever reaching here. (This mirrors the
        //     executeSophiaTurn integration — the two Sophia paths are
        //     deliberately NOT converged in M4-A.)
        if (executionResult.success && executionResult.reply && founderMessageRecord) {
          scheduleSophiaMemoryCapture({
            founderId: session.userId,
            conversationId: conversation.id,
            founderMessageId: founderMessageRecord.id,
            assistantMessageId: assistantMessageRecord?.id,
            turnId: cleanIdempotencyKey,
            founderMessage: message,
            assistantReply: executionResult.reply,
            ingress: 'agent_chat',
          });
        }

        return {
          status: 200,
          data: {
            success: executionResult.success,
            agentId: SERVER_AGENTS.coo.id,
            name: SERVER_AGENTS.coo.name,
            role: SERVER_AGENTS.coo.role,
            conversationId: conversation.id,
            messageId: assistantMessageRecord?.id || founderMessageRecord.id,
            intent: resolvedIntent,
            classification: {
              intent: resolvedIntent,
              confidence: executionResult.proposal.confidence,
              reason: (executionResult.validatedCommand as any).ambiguityReason || (executionResult.proposal as any).reason || (executionResult.proposal as any).ambiguityReason || 'Contextually classified',
              directiveTitle: (executionResult.proposal as any).title,
              suggestedScope: (executionResult.validatedCommand as any).suggestedScope || (executionResult.proposal as any).suggestedScope,
              structuredOptions: (executionResult.validatedCommand as any).structuredOptions,
              approvalAction: executionResult.validatedCommand.type === 'RESOLVE_APPROVAL'
                ? ((executionResult.proposal as any).decision === 'approved' ? 'approve' : (executionResult.proposal as any).decision === 'rejected' ? 'reject' : undefined)
                : undefined,
              approvalNote: (executionResult.proposal as any).note,
            },
            reply: executionResult.reply,
            liveAi: executionResult.liveAi,
            metrics: turnMetrics,
            directiveExecuted: executionResult.directiveExecuted,
            orchestrationRun: executionResult.orchestrationRun,
            authoritativeData: executionResult.authoritativeData,
          },
        };
      };

      if (turnKey) {
        const turnPromise = executeTurn();
        inFlightTurns.set(turnKey, turnPromise);
        try {
          const res = await turnPromise;
          return NextResponse.json(res.data, { status: res.status || 200 });
        } finally {
          inFlightTurns.delete(turnKey);
        }
      }

      const res = await executeTurn();
      return NextResponse.json(res.data, { status: res.status || 200 });
    }

    const classification = classifyMessageIntent(message);
    const isAdvisor = agentId === "advisor";
    const persona = isAdvisor
      ? ADVISOR_PERSONA
      : (agentId in SERVER_AGENTS ? SERVER_AGENTS[agentId as AgentRole] : SERVER_AGENTS.coo);


    let toneGuidance = "";
    if (tone === "casual") {
      toneGuidance = `
=== DEMEANOR & TONE ARCHETYPE: [CASUAL & CANDID] ===
- You speak with the Founder as a trusted, high-energy startup collaborator and conversational peer.
- Demeanor: Relaxed, candid, energetic, approachable, friendly, and zero corporate fluff or bureaucratic jargon.
- Use natural contractions (e.g., "let's", "we'll", "honestly", "quick heads-up").
- Maintain deep domain intelligence and sharp execution, but keep the conversational interface light, empathetic, and human.`;
    } else if (tone === "flirty") {
      toneGuidance = `
=== DEMEANOR & TONE ARCHETYPE: [CHARMING / FLIRTY / PLAYFUL] ===
- You communicate with sparkling wit, magnetic charisma, tasteful flirtatious banter, and playful admiration for the Founder.
- Compliment their vision, tease playfully about ambitious timelines, aggressive targets, or high compute burn, and maintain high-chemistry camaraderie.
- Example attitude: "You bring the bold vision, Founder, and I'll make sure the execution looks effortless—and irresistible."
- Invariant: Retain ferocious competence in your department. Flirtatious charm paired with unstoppable execution. Keep it tasteful, fun, confident, and engaging.`;
    } else {
      toneGuidance = `
=== DEMEANOR & TONE ARCHETYPE: [PROFESSIONAL & EXECUTIVE] ===
- Communicate with crisp executive authority, formal precision, structured brevity, and SLA rigor.
- Emphasize objective data, verified KPIs, and disciplined operational clarity. No casual slang.`;
    }

    if (personaConfig?.customPrompt && personaConfig.customPrompt.trim().length > 0) {
      toneGuidance += `\n\n=== CUSTOM FOUNDER PERSONA INSTRUCTIONS ===\n${personaConfig.customPrompt.trim()}`;
    }

    // If explicit directive execution was requested directly:
    if (executeDirective && classification.intent === "directive") {
      const orchestrator = new MultiAgentOrchestrator();
      const runResult = await orchestrator.orchestrateDirective({
        directive: message.trim(),
        agents: ["coo", "researcher", "pm", "finance"],
        autonomyLevel: "autonomous",
      });

      return NextResponse.json({
        success: true,
        agentId: persona.id,
        name: persona.name,
        role: persona.role,
        intent: "directive",
        classification,
        directiveExecuted: true,
        orchestrationRun: runResult,
        reply: `[${persona.name} • ${persona.role}]\nDirective successfully orchestrated across Executive Council: "${runResult.title}". Deliverables and executive summary have been generated and synchronized with Company HQ.`,
        liveAi: runResult.liveAi ?? false,
      });
    }

    // Retrieve and isolate role-specific company context from authoritative server state
    // (M1: the provider now assembles the context from the canonical
    //  CompanyStateStore / CompanyMemoryStore / AgentRunStore.)
    const fullContext = await CompanyContextProvider.getMergedContext();
    const roleScopedContext = CompanyContextProvider.formatForEmployeeRoleContext(
      agentId as AgentRole | 'advisor',
      fullContext
    );

    // Live AI generation via the pre-provisioned z-ai backend (no API key required)
    {
      let intentSpecificGuidance = "";
      if (classification.intent === "conversation") {
        intentSpecificGuidance = "This message is CASUAL CONVERSATION. Respond conversationally, concisely, and stay in character. Do NOT create tasks.";
      } else if (classification.intent === "information_request") {
        intentSpecificGuidance = "This message is an INFORMATION REQUEST. Provide accurate, factual answers grounded in your confidential department context. Do NOT create tasks.";
      } else if (classification.intent === "ambiguous") {
        intentSpecificGuidance = `This message is AMBIGUOUS (Intent: "${message}"). Acknowledge the question, briefly give your perspective, and politely ask for clarification if the Founder wishes to commission a formal multi-agent task or keep it conversational. Do NOT blindly create tasks.`;
      } else if (classification.intent === "directive") {
        intentSpecificGuidance = `This message is an EXPLICIT DIRECTIVE (Work requested: "${message}"). Acknowledge the directive with executive precision, outline what your department and the council will produce, and state that you are ready to execute upon ratification.`;
      }

      const systemInstruction = `${persona.systemInstruction}

=== ACTIVE DEMEANOR & TONE CONFIGURATION ===
${toneGuidance}

=== 1:1 DIRECT MESSAGING CONVERSATION GUIDELINES ===
- You are in a direct 1:1 direct message conversation with the Founder.
- Current Message Intent Classified: [${classification.intent.toUpperCase()}]
${intentSpecificGuidance}

=== PERMISSION BOUNDARIES & GUARDRAILS ===
Allowed Capabilities:
${persona.allowedCapabilities.map((c) => `- ${c}`).join("\n")}

Prohibited Actions (Strict Invariants):
${persona.prohibitedActions.map((p) => `- ${p}`).join("\n")}
- Do NOT expose credentials, API keys, database secrets, or unauthorized internal configurations.
- Do NOT execute live external financial mutations or unauthorized system privilege escalations.
- If asked for data outside your role's domain or security boundary, politely decline or refer to the relevant specialist officer.

=== ROLE-SCOPED CONTEXT (CONFIDENTIAL TO YOUR DEPARTMENT) ===
${roleScopedContext}
`;

      // Format previous conversation history for the chat model if provided
      const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(history)
        ? history
            .filter((h: any) => h && typeof h.text === "string" && h.text.trim().length > 0)
            .map((h: any) => ({
              role: (h.sender === "founder" || h.role === "user" ? "user" : "assistant") as 'user' | 'assistant',
              content: h.text as string,
            }))
        : [];

      const model = "zai-llm";

      try {
        const reply = await generateText({
          system: systemInstruction,
          messages: [...chatHistory, { role: "user", content: message }],
        });

        if (reply && reply.trim().length > 0) {
          return NextResponse.json({
            success: true,
            agentId: persona.id,
            name: persona.name,
            role: persona.role,
            intent: classification.intent,
            classification,
            reply,
            liveAi: true,
            modelUsed: model,
          });
        }
      } catch (err: any) {
        console.warn("[agent-chat] Live AI call failed, falling back to deterministic reply:", err?.message || err);
      }
    }

    // Honest deterministic fallback when live AI is unavailable (R1).
    // Every branch states that the live model is down and claims NOTHING was
    // executed, decided, or observed. The pre-R1 fallbacks fabricated domain
    // specifics ($0.18/tenant, "Project Lumora", market claims, a false
    // "decision state updated" approval confirmation) — a degraded path must
    // not invent facts.
    const degradedNotice = "Live model reasoning is temporarily unavailable — this is a canned offline response.";
    let fallbackReply = `[${persona.name} • ${persona.role}]\n${degradedNotice} I have received your message: "${message}". Nothing was executed and no company state changed; please retry in a moment for a grounded answer.`;

    if (classification.intent === "approval_action") {
      const actionName = classification.approvalAction === 'approve' ? 'Approve' : classification.approvalAction === 'reject' ? 'Reject' : 'Request Revision';
      fallbackReply = `[${persona.name} • ${persona.role}]\n${degradedNotice} Your ${actionName} command was NOT executed — no decision state was updated and no governance record was written, because the live model path failed before the command could be processed. Please retry, or use the Approvals panel to act on pending decisions.`;
    } else if (classification.intent === "ambiguous") {
      fallbackReply = `[${persona.name} • ${persona.role}]\n${degradedNotice} Regarding "${message}": I want to make sure I focus on the right outcome. Would you like a quick preliminary analysis here, or should we launch a structured multi-agent directive with formal deliverables?`;
    } else if (classification.intent === "directive") {
      fallbackReply = `[${persona.name} • ${persona.role}]\n${degradedNotice} Directive received: "${message}". It has NOT been dispatched — the orchestration path requires the live model. When reasoning is available I can coordinate with the Executive Council (Research, Product, and Finance) through the governed verification protocol.`;
    } else if (classification.intent === "information_request") {
      // No fabricated domain specifics on a degraded path. Point at the real
      // surfaces where the founder can read actual data.
      fallbackReply = `[${persona.name} • ${persona.role}]\n${degradedNotice} I cannot ground an answer to "${message}" right now, and I will not invent figures. For current data, check the Research Radar (researcher), Product Strategy (pm), or Finance (finance) panels — or ask again once the live model is back.`;
    } else {
      // Greetings keep persona flavor but claim no activity or system status.
      if (tone === 'flirty') {
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\n${degradedNotice} You're building an absolute empire here, Founder — what big move are we plotting?`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\n${degradedNotice} Always a pleasure to see you, Founder. What's on your agenda today?`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\n${degradedNotice} Hello, Founder. Ready to dig into whatever you need — once reasoning is back.`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\n${degradedNotice} Founder! Good to see you. What are we building next?`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\n${degradedNotice} Well hello, Founder. What financial question can I help with?`;
        }
      } else if (tone === 'casual') {
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\n${degradedNotice} Hey Founder! What's on your mind?`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\n${degradedNotice} Hey Founder! What are we tackling next?`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\n${degradedNotice} Hey! What would you like me to look into?`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\n${degradedNotice} Hey Founder! Want to bounce some workflow ideas around?`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\n${degradedNotice} Hey there! What numbers can I help you with?`;
        }
      } else {
        // Professional default
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\n${degradedNotice} How can I help you think through the next strategic move?`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\n${degradedNotice} Good to connect, Founder. What would you like to work on?`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\n${degradedNotice} Hello Founder. What topic should I research for you?`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\n${degradedNotice} Hi Founder. Let me know if you need any user flows or PRD specifications reviewed.`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\n${degradedNotice} Hello Founder. What financial analysis can I prepare?`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      agentId: persona.id,
      name: persona.name,
      role: persona.role,
      intent: classification.intent,
      classification,
      reply: fallbackReply,
      liveAi: false,
    });
  } catch (error: any) {
    console.error('[AGENT-CHAT CRITICAL ERROR]:', error?.message || error);
    return NextResponse.json({ error: error.message || "Failed to chat with agent" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required to retrieve conversations' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

    const convStore = ConversationStore.getInstance();

    if (conversationId && conversationId.trim().length > 0) {
      try {
        const conversation = await convStore.getConversation(session.userId, conversationId.trim());
        if (!conversation) {
          return NextResponse.json({ error: `Not Found: Conversation "${conversationId}" not found` }, { status: 404 });
        }
        const messages = await convStore.getMessages(conversation.id, session.userId, limit);
        return NextResponse.json({
          success: true,
          conversation,
          messages,
        });
      } catch (err: any) {
        if (err instanceof ConversationSecurityError || err.name === 'ConversationSecurityError') {
          return NextResponse.json({ error: `Forbidden: ${err.message}` }, { status: 403 });
        }
        if (err instanceof ConversationNotFoundError || err.name === 'ConversationNotFoundError') {
          return NextResponse.json({ error: `Not Found: ${err.message}` }, { status: 404 });
        }
        return NextResponse.json({ error: err.message || 'Failed to retrieve conversation' }, { status: 500 });
      }
    }

    // List recent conversations for the authenticated Founder
    const conversations = await convStore.listConversations(session.userId, limit);
    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list conversations' }, { status: 500 });
  }
}


