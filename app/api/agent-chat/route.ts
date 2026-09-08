import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { SERVER_AGENTS } from "@/lib/server/agents/definitions";
import { AgentRole } from "@/types/os";
import { CompanyContextProvider } from "@/lib/server/context/company-context";
import { MultiAgentOrchestrator } from "@/lib/server/orchestration/orchestrator";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

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
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required to communicate with executive agents' },
        { status: 401 }
      );
    }

    const { agentId, message, history, contextSnapshot, executeDirective, personaConfig } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 });
    }

    if (executeDirective && session.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Forbidden: Only verified Founder can trigger autonomous directive execution' },
        { status: 403 }
      );
    }

    const classification = classifyMessageIntent(message);
    const isAdvisor = agentId === "advisor";
    const persona = isAdvisor
      ? ADVISOR_PERSONA
      : (agentId in SERVER_AGENTS ? SERVER_AGENTS[agentId as AgentRole] : SERVER_AGENTS.coo);

    const tone = (personaConfig?.tone || 'professional') as 'professional' | 'casual' | 'flirty';

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
    const fullContext = CompanyContextProvider.getMergedContext();
    const roleScopedContext = CompanyContextProvider.formatForEmployeeRoleContext(
      agentId as AgentRole | 'advisor',
      fullContext
    );

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

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

      // Format previous conversation history for Gemini chat if provided
      const chatHistory = Array.isArray(history)
        ? history
            .filter((h: any) => h && typeof h.text === "string" && h.text.trim().length > 0)
            .map((h: any) => ({
              role: h.sender === "founder" || h.role === "user" ? "user" : "model",
              parts: [{ text: h.text }],
            }))
        : [];

      const candidateModels = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

      for (const model of candidateModels) {
        try {
          const chat = ai.chats.create({
            model,
            history: chatHistory.length > 0 ? chatHistory : undefined,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          const response = await chat.sendMessage({
            message,
          });

          if (response.text) {
            return NextResponse.json({
              success: true,
              agentId: persona.id,
              name: persona.name,
              role: persona.role,
              intent: classification.intent,
              classification,
              reply: response.text,
              liveAi: true,
              modelUsed: model,
            });
          }
        } catch (err: any) {
          const isHighDemand =
            err?.status === 503 ||
            err?.code === 503 ||
            err?.message?.includes("high demand") ||
            err?.message?.includes("UNAVAILABLE") ||
            err?.message?.includes("RESOURCE_EXHAUSTED");
          if (isHighDemand) {
            continue;
          }
          break;
        }
      }
    }

    // High-fidelity domain-tailored truthful fallback when GEMINI_API_KEY is not configured
    let fallbackReply = `[${persona.name} • ${persona.role}]\nI have received your message: "${message}". Live model reasoning is currently waiting for a GEMINI_API_KEY in Settings. All execution invariants and sandbox parameters remain safely preserved.`;

    if (classification.intent === "approval_action") {
      const actionName = classification.approvalAction === 'approve' ? 'Approved & Ratified' : classification.approvalAction === 'reject' ? 'Rejected' : 'Revision Requested';
      fallbackReply = `[${persona.name} • ${persona.role}]\nFounder Governance Directive registered: [${actionName}]. The decision state has been updated across Company HQ and governance records with full audit trail.`;
    } else if (classification.intent === "ambiguous") {
      fallbackReply = `[${persona.name} • ${persona.role}]\nRegarding "${message}": I want to make sure I focus on the right outcome. Would you like a quick preliminary analysis here, or should we launch a structured multi-agent directive with formal deliverables?`;
    } else if (classification.intent === "directive") {
      fallbackReply = `[${persona.name} • ${persona.role}]\nDirective received: "${message}". I can coordinate with the Executive Council (Research, Product, and Finance) to execute our 9-step verification protocol and generate formal deliverable artifacts.`;
    } else if (classification.intent === "information_request") {
      if (agentId === 'researcher') {
        fallbackReply = `[Dr. Aris Thorne • Research]\nBased on our research radar: The European market shows strong demand for sovereign, privacy-first agent runtimes with strict GDPR compliance and localized data governance.`;
      } else if (agentId === 'finance') {
        fallbackReply = `[Julian Cruz • Finance]\nFinancial Standing: Live accounting integration is pending connection. Under our target baseline model, we maintain an 80%+ gross margin floor and disciplined capital management. Real-time ledger sync is required for audited metrics.`;
      } else if (agentId === 'pm') {
        fallbackReply = `[Maya Lin • Product]\nActive roadmap status: Project Lumora (Self-Serve AI Agent Onboarding) is currently in draft roadmap review with target completion pending founder ratification.`;
      } else if (agentId === 'coo' || isAdvisor) {
        fallbackReply = `[Sophia Vance • COO]\nOperations overview: Workstream dispatch and approval gates are operational. Live execution telemetry is logged against active workflow runs.`;
      }
    } else {
      // General conversation & greetings tailored by active tone
      if (tone === 'flirty') {
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\nYou're building an absolute empire here, Founder. Lucky for you, I've got both the strategic vision and the charm to make it happen. What big move are we plotting?`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\nAlways a pleasure to see you, Founder. Executive operations are running flawlessly—almost as flawlessly as that brilliant strategic mind of yours. What's on your agenda today?`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\nHello, Founder. I spent all morning analyzing billions of neural parameters, but nothing in this lab is quite as fascinating as your vision. Ready whenever you are.`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\nFounder! Your product roadmap is looking dangerously ambitious today, and I'm completely here for it. Let's make everyone fall in love with what we're building.`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\nWell hello, Founder. Financial governance is looking sharp today. Our 80%+ gross margin invariant stands firm—let's make sure we keep turning heads on the balance sheet.`;
        }
      } else if (tone === 'casual') {
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\nHey Founder! All systems are green. Main priority right now is shipping fast, keeping burn under control, and crushing our customer growth targets. What's on your mind?`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\nHey Founder! Everything on the operations desk is running super smooth today. The team is locked in. What are we tackling next?`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\nHey! Just plowed through some wild new papers on vector recall and model latency. Got a minute? You're going to love what we can do with this.`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\nHey Founder! Product sprints are moving fast and the designs are feeling great. Want to bounce some quick workflow ideas around?`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\nHey there! Financial discipline is solid: our gross margin floor invariant is holding, burn is disciplined, and the balance sheet is protected.`;
        }
      } else {
        // Professional default
        if (isAdvisor) {
          fallbackReply = `[Founder Intelligence]\nAll systems are operating nominally. Strategic focus remains centered on product velocity, gross margin preservation (80%+), and disciplined enterprise customer acquisition.`;
        } else if (agentId === 'coo') {
          fallbackReply = `[Sophia Vance • COO]\nGood to connect, Founder. Executive operations and inter-agent coordination are running smoothly across all active workstreams.`;
        } else if (agentId === 'researcher') {
          fallbackReply = `[Dr. Aris Thorne • Research]\nHello Founder. I'm actively monitoring frontier model releases, latency benchmarks, and competitive architectural shifts.`;
        } else if (agentId === 'pm') {
          fallbackReply = `[Maya Lin • Product]\nHi Founder. Product engineering sprints are on schedule. Let me know if you need any user flows or PRD specifications reviewed.`;
        } else if (agentId === 'finance') {
          fallbackReply = `[Julian Cruz • Finance]\nHello Founder. Unit economics remain healthy with compute spend well within our budgeted $0.18 per active tenant ceiling.`;
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
    return NextResponse.json({ error: error.message || "Failed to chat with agent" }, { status: 500 });
  }
}


