import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/server/ai/zai-client";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";
import { CollaborationDialogue } from "@/types/os";

export async function POST(req: NextRequest) {
  try {
    // Fail closed: this route drives live LLM generation (provider quota)
    // and renders council collaboration — a Founder session is required.
    // (Defense-in-depth on top of the executive-route middleware gate.)
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { directive, action, currentDialogues, targetAgent } = body;

    if (!directive || typeof directive !== 'string') {
      return NextResponse.json({ error: 'Directive is required' }, { status: 400 });
    }

    // Live AI generation via the pre-provisioned z-ai backend
    try {
      {
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

        const parsed = await generateJson({
          system: systemPrompt,
          messages: [{ role: "user", content: "Generate the structured multi-agent collaboration sequence now. Respond ONLY with raw valid JSON." }],
        });

        return NextResponse.json({
          success: true,
          source: 'zai-live',
          title: parsed.title || `Collaborative Initiative: ${directive}`,
          summary: parsed.summary || 'Multi-agent collaboration executed successfully.',
          delegatedTasks: parsed.delegatedTasks || [],
          mediations: parsed.mediations || [],
          dialogues: parsed.dialogues || [],
        });
      }
    } catch (err) {
      console.warn('[agent-collab] Live AI call failed, falling back to deterministic synthesis:', err);
    }

    // Honest degraded response when the live AI call fails (R1).
    // The pre-R1 "Deterministic High-Craft Engine" fabricated a complete
    // council session — completed subtasks, $0.038/op economics, an 84.2%
    // margin floor, ticket #CR-920, a "PRD ratified for Sprint 15", and a
    // claim that Company Memory had been updated. None of it happened. A
    // degraded path reports its own degradation: one honest notice from the
    // orchestrator persona, zero fabricated work products.
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cleanDir = directive.trim();

    const degradedNotice = `Live model unavailable — the collaboration session for "${cleanDir}" was NOT executed. No subtasks were run, no deliberation took place, and nothing was written to Company Memory. This is a canned offline notice, not a simulation. Please retry when the model is available.`;

    const dialogues: (CollaborationDialogue & { outputArtifact?: string })[] = [
      {
        id: `collab-turn-1`,
        from: 'coo',
        fromName: 'Sophia Vance (Chief Operating Officer)',
        to: 'council',
        toName: 'Executive Council & Founder',
        protocolStep: 'understand',
        intent: 'status_update',
        message: `[Sophia Vance • COO]\n${degradedNotice}`,
        timestamp,
        outputArtifact: 'None — no collaboration artifacts were produced on the degraded path.',
      },
    ];

    return NextResponse.json({
      success: true,
      source: 'degraded-no-model',
      title: `Collaboration Unavailable: ${cleanDir.slice(0, 48)}`,
      summary: degradedNotice,
      delegatedTasks: [],
      mediations: [],
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
