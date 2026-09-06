import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { AgentRole, CollaborationDialogue, DelegatedSubTask, OrchestratorMediation } from "@/types/os";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { directive, action, currentDialogues, targetAgent } = body;

    if (!directive || typeof directive !== 'string') {
      return NextResponse.json({ error: 'Directive is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Check if live AI generation is possible
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = `You are the Multi-Agent Communication Bus and Orchestrator Kernel for SamJuniors OS.
You coordinate authentic, highly technical, and cross-functional communication between 4 AI executives:
1. Sophia Vance (COO & Orchestrator, ID: 'coo'): Decomposes directives, assigns tasks, enforces constitutional bounds, and mediates trade-offs.
2. Dr. Aris Thorne (Lead AI Researcher, ID: 'researcher'): Conducts market reconnaissance, technical feasibility analysis, and data-grounded trade-offs.
3. Maya Lin (Principal Product Manager, ID: 'pm'): Authors PRDs, defines user journeys, acceptance criteria, and roadmap sequencing.
4. Julian Cruz (VP Finance & Economics, ID: 'finance'): Audits unit economics, enforces gross margin floors (>80%), and compute budget ceilings.

The Founder submitted this directive: "${directive}".

Generate a structured multi-agent interaction sequence (5-7 steps) where these agents collaborate to fulfill the directive.
Crucially:
- Include at least TWO sub-task delegations (e.g., COO delegates to Researcher or PM; Researcher asks Finance for budget limits).
- Include information sharing (sharing benchmarks or metrics).
- Include status updates (agents reporting their progress).
- Include at least ONE Orchestrator Mediation where Sophia Vance steps in to resolve a friction or trade-off (e.g., UX richness vs compute budget, or speed vs verification rigor).

Respond with valid JSON matching this structure:
{
  "title": "A concise executive title for this collaborative mission",
  "summary": "1-2 sentence executive summary of the outcome",
  "delegatedTasks": [
    {
      "id": "subtask-1",
      "title": "Short title",
      "description": "Details",
      "assignedBy": "coo",
      "assignedTo": "researcher",
      "priority": "critical",
      "status": "completed",
      "deliverableExpected": "What was expected",
      "deliverableOutput": "What was produced"
    }
  ],
  "mediations": [
    {
      "id": "med-1",
      "disputeOrFriction": "Summary of trade-off or conflict",
      "agentsInvolved": ["pm", "finance"],
      "orchestratorRuling": "Sophia Vance ruling reconciling the positions",
      "compromiseStrategy": "Specific technical or operational compromise",
      "slaImpact": "Zero SLA breach"
    }
  ],
  "dialogues": [
    {
      "id": "diag-1",
      "from": "coo",
      "fromName": "Sophia Vance (COO)",
      "to": "researcher",
      "toName": "Dr. Aris Thorne (Lead Researcher)",
      "protocolStep": "understand",
      "intent": "delegate_subtask",
      "message": "Specific spoken dialogue from Sophia Vance...",
      "outputArtifact": "Description of artifact"
    }
  ]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt }],
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text || '';
        try {
          const parsed = JSON.parse(rawText);
          return NextResponse.json({
            success: true,
            source: 'gemini-live',
            title: parsed.title || `Collaborative Initiative: ${directive}`,
            summary: parsed.summary || 'Multi-agent collaboration executed successfully.',
            delegatedTasks: parsed.delegatedTasks || [],
            mediations: parsed.mediations || [],
            dialogues: parsed.dialogues || [],
          });
        } catch {
          // If JSON parse fails, fall through to deterministic high-craft fallback
        }
      } catch (err) {
        console.warn('[agent-collab] Gemini live call failed, falling back to deterministic synthesis:', err);
      }
    }

    // Deterministic High-Craft Engine (Safe Mock Execution)
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cleanDir = directive.trim();

    const isPricingOrFinance = /price|pricing|cost|margin|burn|revenue|arr|budget|economics/i.test(cleanDir);
    const isTechOrSpeed = /latency|speed|performance|infra|model|inference|memory|cache/i.test(cleanDir);
    const isExpansionOrMarket = /europe|global|expand|enterprise|market|competitor|growth/i.test(cleanDir);

    let title = `Strategic Alignment: ${cleanDir.slice(0, 48)}`;
    if (isPricingOrFinance) title = `Unit Economics & Margin Optimization: ${cleanDir.slice(0, 40)}`;
    else if (isTechOrSpeed) title = `System Architecture & Latency Optimization: ${cleanDir.slice(0, 40)}`;
    else if (isExpansionOrMarket) title = `Market Expansion & Competitive Recon: ${cleanDir.slice(0, 40)}`;

    const delegatedTasks: DelegatedSubTask[] = [
      {
        id: `subtask-${Date.now()}-1`,
        title: 'Empirical Feasibility & Competitive Recon',
        description: `Analyze market benchmarks, architectural limits, and competitor moats for: "${cleanDir}".`,
        assignedBy: 'coo',
        assignedTo: 'researcher',
        status: 'completed',
        priority: 'critical',
        deliverableExpected: 'Market & Technical Recon Dossier',
        deliverableOutput: 'Verified dossier with empirical confidence ratings and zero hallucinated metrics.',
        orchestratorNote: 'Validated under Safe Sandbox constraints with sub-120ms latency threshold.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `subtask-${Date.now()}-2`,
        title: 'Financial Unit Economics & Compute Margin Floor Audit',
        description: 'Audit unit margins, token expenditure rates, and compute ceilings.',
        assignedBy: 'researcher',
        assignedTo: 'finance',
        status: 'completed',
        priority: 'high',
        deliverableExpected: 'Unit Economics Constraint Model',
        deliverableOutput: 'Hard ceiling established at $0.038/op with 84.2% gross margin floor.',
        orchestratorNote: 'Mandates 2-tier LRU semantic caching to buffer compute spikes.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `subtask-${Date.now()}-3`,
        title: 'Product Requirements Specification & Acceptance Criteria',
        description: 'Synthesize research data and financial constraints into formal PRD.',
        assignedBy: 'coo',
        assignedTo: 'pm',
        status: 'completed',
        priority: 'critical',
        deliverableExpected: 'Sprint-Ready PRD with Acceptance Criteria',
        deliverableOutput: 'PRD ratified for Sprint 15 with 100% specification readiness.',
        orchestratorNote: 'Reconciled UX richness with financial margin invariants.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const mediations: OrchestratorMediation[] = [
      {
        id: `med-${Date.now()}-1`,
        disputeOrFriction:
          'Product Manager requested unconstrained real-time vector queries for UX richness, while Finance Analyst enforced strict compute burn ceilings.',
        agentsInvolved: ['pm', 'finance'],
        orchestratorRuling:
          'Sophia Vance arbitrated: Authorize two-tier LRU semantic caching with speculative pre-fetching. Preserves sub-100ms user responsiveness while keeping token spend under $0.038/op.',
        compromiseStrategy:
          'Hybrid memory buffer: top 20% active context cached locally; cold queries routed via quantized embedding models.',
        slaImpact: '0ms added latency; 84.2% gross margin preserved.',
        timestamp,
      },
    ];

    const dialogues: (CollaborationDialogue & { outputArtifact?: string })[] = [
      {
        id: `collab-turn-1`,
        from: 'coo',
        fromName: 'Sophia Vance (Chief Operating Officer)',
        to: 'researcher',
        toName: 'Dr. Aris Thorne (Lead Researcher)',
        protocolStep: 'understand',
        intent: 'delegate_subtask',
        message: `Dr. Thorne: The Founder has issued a priority directive: "${cleanDir}". I am decomposing this into our execution graph. Please initiate market reconnaissance, competitor moats, and technical feasibility parameters. Prioritize empirical rigor.`,
        timestamp,
        subtask: delegatedTasks[0],
        outputArtifact: 'Directive decomposed; Research ticket #CR-920 registered.',
      },
      {
        id: `collab-turn-2`,
        from: 'researcher',
        fromName: 'Dr. Aris Thorne (Lead Researcher)',
        to: 'finance',
        toName: 'Julian Cruz (Chief Financial Analyst)',
        protocolStep: 'research',
        intent: 'share_information',
        message: `Julian: Market recon validates strong demand for "${cleanDir}". However, high-frequency execution risks unbounded API token burn without strict guardrails. What is our hard compute ceiling and gross margin floor for this initiative?`,
        timestamp,
        subtask: delegatedTasks[1],
        outputArtifact: 'Market reconnaissance complete; financial constraints requested.',
      },
      {
        id: `collab-turn-3`,
        from: 'finance',
        fromName: 'Julian Cruz (Chief Financial Analyst)',
        to: 'pm',
        toName: 'Maya Lin (Principal PM)',
        protocolStep: 'test',
        intent: 'status_update',
        message: `Maya: I stress-tested unit economics across 250 enterprise seats. To protect our 84.2% gross margin floor, compute cost MUST NOT exceed $0.038 per 1k operations. We cannot allow un-cached real-time calls. You must spec a tiered caching architecture in the PRD.`,
        timestamp,
        subtask: delegatedTasks[1],
        outputArtifact: 'Unit economics audited; compute ceiling locked at $0.038/op.',
      },
      {
        id: `collab-turn-4`,
        from: 'pm',
        fromName: 'Maya Lin (Principal PM)',
        to: 'coo',
        toName: 'Sophia Vance (Chief Operating Officer)',
        protocolStep: 'analyze',
        intent: 'inquire',
        message: `Sophia: Julian's $0.038 cap is tight for continuous streaming. Can we compromise on a two-tier semantic cache so we don't degrade the enterprise UX? I need your orchestration ruling before locking the PRD acceptance criteria.`,
        timestamp,
        mediation: mediations[0],
        outputArtifact: 'Friction escalated to Orchestrator for mediation.',
      },
      {
        id: `collab-turn-5`,
        from: 'coo',
        fromName: 'Sophia Vance (Chief Operating Officer)',
        to: 'council',
        toName: 'Executive Council (Maya Lin, Julian Cruz, Dr. Thorne)',
        protocolStep: 'plan',
        intent: 'orchestrator_mediation',
        message: `[Orchestrator Ruling] Ruling ratified: Maya's two-tier LRU semantic caching model is approved. Top 20% active queries stay in warm cache, capping compute spend at $0.036/op (satisfying Julian) while guaranteeing sub-100ms response (satisfying Maya). Maya, finalize the PRD. Julian, monitor token telemetry.`,
        timestamp,
        mediation: mediations[0],
        outputArtifact: 'Orchestrator mediation signed off; consensus established.',
      },
      {
        id: `collab-turn-6`,
        from: 'pm',
        fromName: 'Maya Lin (Principal PM)',
        to: 'council',
        toName: 'Executive Council & Founder',
        protocolStep: 'build_execute',
        intent: 'status_update',
        message: `Council & Founder: Formal PRD (PRD-${Date.now().toString().slice(-4)}) has been completed! Feature added to Sprint backlog with 100% specification readiness. All acceptance criteria reflect Dr. Thorne's benchmarks and Julian's ratified compute cap.`,
        timestamp,
        subtask: delegatedTasks[2],
        outputArtifact: 'PRD authored and registered in Product Strategy queue.',
      },
      {
        id: `collab-turn-7`,
        from: 'coo',
        fromName: 'Sophia Vance (Chief Operating Officer)',
        to: 'council',
        toName: 'Executive Council & Founder',
        protocolStep: 'report',
        intent: 'ratify',
        message: `[Executive Ratification] Multi-agent collaboration completed with full cross-functional consensus. Product Roadmap, Research Radar, and Financial Guardrails are synchronized and logged to durable Company Memory.`,
        timestamp,
        outputArtifact: 'Governance decision ratified; Company Memory updated.',
      },
    ];

    return NextResponse.json({
      success: true,
      source: 'deterministic-orchestrator',
      title,
      summary: `Sophia Vance, Dr. Thorne, Maya Lin, and Julian Cruz successfully aligned and executed "${cleanDir}" with verified unit economics and zero constitutional violations.`,
      delegatedTasks,
      mediations,
      dialogues,
    });
  } catch (error: any) {
    console.error('[agent-collab] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Failed to process collaboration request', details: error.message },
      { status: 500 }
    );
  }
}
