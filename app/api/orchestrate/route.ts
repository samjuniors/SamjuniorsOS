import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { directive, agents = ["coo", "researcher", "pm", "finance"], autonomyLevel = "autonomous" } = await req.json();

    if (!directive || typeof directive !== "string") {
      return NextResponse.json({ error: "Directive is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // If Gemini API is available, generate real dynamic agent orchestration adhering to the 9-Step Agent Work Protocol
    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `You are the master Orchestrator & COO (Sophia Vance) for "SamJuniors OS" — an operating system for an autonomous AI-run company.
The Founder has issued the following Executive Directive:
"${directive}"

You must orchestrate a 4-agent executive workforce through the 9-Step Agent Work Protocol:
1. Understand (COO: scope boundaries, constraints, success KPIs)
2. Research (Researcher: Dr. Aris Thorne on market recon, competitor benchmarks)
3. Analyze (Researcher & Finance: technical risk matrix & compute sensitivity)
4. Plan (COO: inter-agent task delegation & dependency resolution)
5. Build/Execute (PM: Maya Lin drafts PRD, specs, and user flows)
6. Test (Finance: Julian Cruz stress-tests margins & unit economics)
7. Verify (COO: audits constitutional compliance, zero-drift SLA bounds, and safe execution)
8. Review (Council: cross-functional peer review & critiques)
9. Report (COO: compiles Comprehensive Final Executive Report and vaults deliverables)

Generate a comprehensive JSON response adhering strictly to this schema:
{
  "title": "Strategic initiative title",
  "summary": "2-3 sentence executive synthesis of what the 4-agent workforce concluded",
  "currentProtocolStep": "report",
  "protocolProgress": {
    "understand": "completed",
    "research": "completed",
    "analyze": "completed",
    "plan": "completed",
    "build_execute": "completed",
    "test": "completed",
    "verify": "completed",
    "review": "completed",
    "report": "completed"
  },
  "plan": [
    { "stage": 1, "title": "Directive Ingestion & Scope Clarification", "agentId": "coo", "protocolStep": "understand", "status": "done", "outputSnippet": "Scope & constraint checklist" },
    { "stage": 2, "title": "Market & Competitive Reconnaissance", "agentId": "researcher", "protocolStep": "research", "status": "done", "outputSnippet": "Competitor findings & demand signals" },
    { "stage": 3, "title": "Feasibility & Technical Risk Analysis", "agentId": "researcher", "protocolStep": "analyze", "status": "done", "outputSnippet": "Risk analysis & latency constraints" },
    { "stage": 4, "title": "Inter-Agent Delegation Matrix", "agentId": "coo", "protocolStep": "plan", "status": "done", "outputSnippet": "Assigned sub-tasks to PM & Finance" },
    { "stage": 5, "title": "Product Scoping & PRD Generation", "agentId": "pm", "protocolStep": "build_execute", "status": "done", "outputSnippet": "User flows & acceptance criteria" },
    { "stage": 6, "title": "Unit Economics Simulation & Stress-Test", "agentId": "finance", "protocolStep": "test", "status": "done", "outputSnippet": "Token cost & gross margin audit" },
    { "stage": 7, "title": "Constitutional Compliance Verification", "agentId": "coo", "protocolStep": "verify", "status": "done", "outputSnippet": "SLA & safe execution verification" },
    { "stage": 8, "title": "Executive Council Review & Consensus", "agentId": "coo", "protocolStep": "review", "status": "done", "outputSnippet": "Cross-agent critique & sign-off" },
    { "stage": 9, "title": "Final Executive Synthesis & Report", "agentId": "coo", "protocolStep": "report", "status": "done", "outputSnippet": "Executive package archived in OS Vault" }
  ],
  "messages": [
    { "id": "m1", "sender": "coo", "protocolStep": "understand", "text": "Deconstructing Founder directive into 9-step Agent Work Protocol...", "timestamp": "00:01", "type": "status" },
    { "id": "m2", "sender": "researcher", "protocolStep": "research", "text": "Market findings and competitor analysis...", "timestamp": "00:03", "type": "finding" },
    { "id": "m3", "sender": "pm", "protocolStep": "build_execute", "text": "Drafted PRD specification with user flows and acceptance criteria...", "timestamp": "00:06", "type": "artifact" },
    { "id": "m4", "sender": "finance", "protocolStep": "test", "text": "Unit economics stress-tested. Compute cost modeled with gross margin breakdown...", "timestamp": "00:09", "type": "critique" },
    { "id": "m5", "sender": "coo", "protocolStep": "verify", "text": "Audited against company SLA and verified zero external financial mutation risk...", "timestamp": "00:12", "type": "status" },
    { "id": "m6", "sender": "coo", "protocolStep": "report", "text": "Protocol Step 9 complete. Final Executive Report synthesized for Founder review.", "timestamp": "00:14", "type": "status" }
  ],
  "deliverables": [
    { "name": "Final Executive Report (COO Synthesis)", "owner": "Sophia Vance (Chief Operating Officer)", "protocolStep": "report", "content": "Full detailed markdown executive summary with recommendations, timeline, risk matrix..." },
    { "name": "Product Requirements Document (PRD)", "owner": "Maya Lin (Principal PM)", "protocolStep": "build_execute", "content": "Full detailed markdown PRD..." },
    { "name": "Market & Competitive Intel Memo", "owner": "Dr. Aris Thorne (Lead Researcher)", "protocolStep": "research", "content": "Full detailed markdown research brief..." },
    { "name": "Unit Economics & Financial Projections", "owner": "Julian Cruz (Chief Financial Analyst)", "protocolStep": "analyze", "content": "Full detailed financial breakdown..." }
  ]
}

Return ONLY raw JSON, with no markdown code fences.`;

      const candidateModels = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.7,
            },
          });

          const jsonText = response.text?.trim() || "{}";
          const cleanJson = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed && (parsed.title || parsed.summary || parsed.plan)) {
            return NextResponse.json({ success: true, data: parsed, liveAi: true, modelUsed: model });
          }
        } catch (err: any) {
          const isHighDemand = err?.status === 503 || err?.code === 503 || err?.message?.includes("high demand") || err?.message?.includes("UNAVAILABLE");
          if (isHighDemand) {
            continue;
          }
          break;
        }
      }
    }

    // High quality intelligent template fallback when key is not present or API is busy
    const fallbackResponse = generateIntelligentFallback(directive);
    return NextResponse.json({ success: true, data: fallbackResponse, liveAi: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to orchestrate directive" }, { status: 500 });
  }
}

function generateIntelligentFallback(directive: string) {
  const shortTitle = directive.length > 50 ? directive.slice(0, 48) + "..." : directive;
  
  return {
    title: `Autonomous Directive: ${shortTitle}`,
    summary: `The SamJuniors AI Executive Council has executed the 9-Step Agent Work Protocol for "${shortTitle}". Research confirms strong product-market fit, Product has authored a detailed PRD, Finance verified 84%+ gross margins with bounded compute burn, and COO Sophia Vance synthesized the final executive package.`,
    currentProtocolStep: "report",
    protocolProgress: {
      understand: "completed",
      research: "completed",
      analyze: "completed",
      plan: "completed",
      build_execute: "completed",
      test: "completed",
      verify: "completed",
      review: "completed",
      report: "completed",
    },
    plan: [
      {
        stage: 1,
        title: "Directive Ingestion & Scope Boundary",
        agentId: "coo",
        protocolStep: "understand",
        status: "done",
        outputSnippet: "Deconstructed Founder directive into 4 domain deliverables with strict safe execution guardrails.",
      },
      {
        stage: 2,
        title: "Market Intelligence & Competitor Recon",
        agentId: "researcher",
        protocolStep: "research",
        status: "done",
        outputSnippet: "Benchmarked 12 competitor frameworks. Validated clear TAM demand and user retention signals.",
      },
      {
        stage: 3,
        title: "Technical Feasibility & Risk Modeling",
        agentId: "researcher",
        protocolStep: "analyze",
        status: "done",
        outputSnippet: "Analyzed sub-50ms neural bus throughput and token latency thresholds.",
      },
      {
        stage: 4,
        title: "Inter-Agent Delegation Matrix",
        agentId: "coo",
        protocolStep: "plan",
        status: "done",
        outputSnippet: "Assigned PRD authoring to Maya Lin, unit margin modeling to Julian Cruz.",
      },
      {
        stage: 5,
        title: "Product Architecture & Specification (PRD)",
        agentId: "pm",
        protocolStep: "build_execute",
        status: "done",
        outputSnippet: "Architected user workflows with zero-latency streaming and escalation triggers.",
      },
      {
        stage: 6,
        title: "Unit Economics & Compute Stress-Test",
        agentId: "finance",
        protocolStep: "test",
        status: "done",
        outputSnippet: "Modeled token burn under peak load. Verified 84.8% gross margin with $0.018/task cost.",
      },
      {
        stage: 7,
        title: "Constitutional Compliance Verification",
        agentId: "coo",
        protocolStep: "verify",
        status: "done",
        outputSnippet: "Enforced SOC2 invariants and verified safe mock sandbox boundaries.",
      },
      {
        stage: 8,
        title: "Executive Council Peer Review",
        agentId: "coo",
        protocolStep: "review",
        status: "done",
        outputSnippet: "Concurrence achieved across all 4 agents with 98.6% confidence rating.",
      },
      {
        stage: 9,
        title: "Final Executive Report Synthesis",
        agentId: "coo",
        protocolStep: "report",
        status: "done",
        outputSnippet: "Synthesized executive package and archived deliverables to OS Vault.",
      },
    ],
    messages: [
      {
        id: "m-1",
        sender: "coo",
        protocolStep: "understand",
        text: `[Sophia Vance - COO] Directive received: "${directive}". Initiating the 9-Step Agent Work Protocol across Operations, Research, Product, and Finance.`,
        timestamp: "10:42:01",
        type: "status",
      },
      {
        id: "m-2",
        sender: "researcher",
        protocolStep: "research",
        text: `[Dr. Aris Thorne - Research] Completed reconnaissance across 12 market competitors. Legacy platforms suffer from high latency and brittle configuration. Our integrated OS architecture provides a 5x velocity multiplier.`,
        timestamp: "10:42:04",
        type: "finding",
      },
      {
        id: "m-3",
        sender: "pm",
        protocolStep: "build_execute",
        text: `[Maya Lin - PM] Building on Dr. Thorne's market findings, I have drafted the complete PRD. Prioritized 3 core workflows: automated task delegation, continuous artifact vaulting, and human-in-the-loop escalation guardrails.`,
        timestamp: "10:42:07",
        type: "artifact",
      },
      {
        id: "m-4",
        sender: "finance",
        protocolStep: "test",
        text: `[Julian Cruz - Finance] Simulated token expenditure under peak concurrency. Blended compute cost is $0.018 per directive with 84.8% gross margin. 12-month ARR expansion remains on pace for $2.85M+.`,
        timestamp: "10:42:11",
        type: "critique",
      },
      {
        id: "m-5",
        sender: "coo",
        protocolStep: "verify",
        text: `[Sophia Vance - COO] Verified all operations against company constitution. Safe Mock Execution active: external financial mutations are strictly blocked. 99.98% SLA target confirmed.`,
        timestamp: "10:42:15",
        type: "status",
      },
      {
        id: "m-6",
        sender: "coo",
        protocolStep: "report",
        text: `[Sophia Vance - COO] Protocol Step 9 complete. Executive package compiled and archived into SamJuniors OS Vault for Founder inspection.`,
        timestamp: "10:42:18",
        type: "status",
      },
    ],
    deliverables: [
      {
        name: "Final Executive Report (COO Synthesis)",
        owner: "Sophia Vance (Chief Operating Officer)",
        protocolStep: "report",
        content: `# EXECUTIVE WORKFORCE REPORT: ${directive.toUpperCase()}

## 1. Executive Summary & Strategic Verdict
The Executive AI Council has completed all 9 steps of the Agent Work Protocol regarding: **"${directive}"**.
The initiative is **STRATEGICALLY RECOMMENDED FOR IMMEDIATE EXECUTION**.

## 2. Cross-Functional Council Findings
- **Market & Intel (Dr. Aris Thorne)**: High market urgency identified. Competitive moats rest on our unified operating system paradigm.
- **Product Architecture (Maya Lin)**: Full PRD scoped with phased rollout. Core user journey validated with sub-90s completion.
- **Capital & Unit Economics (Julian Cruz)**: 84.8% gross margin confirmed with $0.018/directive compute cost.
- **Operations & SLAs (Sophia Vance)**: Automated deployment pipelines configured with zero downtime and strict SOC2 compliance.

## 3. 9-Step Protocol Verification
1. **Understand**: Scope and boundary constraints confirmed.
2. **Research**: Comprehensive market & competitive scan completed.
3. **Analyze**: Latency, compute, and risk parameters evaluated.
4. **Plan**: Sub-task dependency graph scheduled.
5. **Build / Execute**: PRDs, specs, and financial models generated.
6. **Test**: Concurrency stress-tests and user persona trials passed.
7. **Verify**: Security invariants and safe-mock execution rules enforced.
8. **Review**: Council consensus achieved (98.6% rating).
9. **Report**: Final synthesis delivered to Founder.

*Security Notice: Mock/Safe Execution Mode engaged. External capital transactions disabled.*`,
      },
      {
        name: "Product Requirements Document (PRD)",
        owner: "Maya Lin (Principal PM)",
        protocolStep: "build_execute",
        content: `### 1. Executive Summary & Objective
Deliver an enterprise-grade autonomous capability fulfilling: "${directive}".

### 2. Target User Personas
- **Autonomous Enterprise Founder**: Demands high-leverage delegation without micromanagement.
- **Operations Lead**: Requires strict budget limits, deterministic audit logs, and instant observability.

### 3. Functional Requirements
- **FR-1 (Neural Dispatch)**: Multi-agent message bus with sub-50ms latency.
- **FR-2 (Artifact Vault)**: Automatic markdown/JSON serialization into SamJuniors OS virtual file system.
- **FR-3 (Human-in-the-Loop Safeguards)**: Threshold-based approval triggers for transactions > $500.

### 4. Key Success Metrics
- Average execution time < 12 seconds
- Autonomous resolution rate > 94%
- Zero hallucination on financial ledger calculations`,
      },
      {
        name: "Market & Competitive Intel Brief",
        owner: "Dr. Aris Thorne (Lead Researcher)",
        protocolStep: "research",
        content: `### Competitive Landscape Assessment
- **Legacy RPA Tools**: Brittle rules, heavy maintenance overhead, lack semantic understanding.
- **Single-Agent Chatbots**: Suffer from context collapse when executing multi-disciplinary strategies.
- **SamJuniors OS Advantage**: Decentralized specialized role agents supervised by a strict kernel orchestrator.

### Quantitative Signals
- 68% of surveyed CTOs intend to replace point AI tools with unified agent operating systems by 2027.
- Key pricing sweet spot: Usage-based compute markup + predictable monthly base.`,
      },
      {
        name: "Unit Economics & Financial Forecast",
        owner: "Julian Cruz (Chief Financial Analyst)",
        protocolStep: "analyze",
        content: `### Unit Cost Breakdown (Per 1,000 Tasks)
- **Input Tokens**: $0.075 / 1M tokens
- **Output Tokens (Structured JSON)**: $0.30 / 1M tokens
- **Blended Execution Cost**: $0.018 per completed directive
- **Customer Price**: $0.15 per directive
- **Gross Margin**: **84.8%**

### 12-Month ARR Projection
- Q1: $180,000 ARR (50 pilot enterprises)
- Q2: $540,000 ARR (150 scaling accounts)
- Q3: $1,280,000 ARR (320 accounts + volume tiers)
- Q4: $2,850,000 ARR (Target profitability achieved)`,
      },
    ],
  };
}

