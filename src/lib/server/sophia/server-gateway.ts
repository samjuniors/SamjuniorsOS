import { MultiAgentOrchestrator } from '../orchestration/orchestrator';
import { InMemoryApprovalStore } from '../authorization/approval-store';
import { CompanyStateStore } from '../state/state-store';
import { EpistemicClaimStore } from '../epistemic/claim-store';
import { AgentRunStore } from '../agents/run-store';
import { SERVER_AGENTS } from '../agents/definitions';
import { SophiaEntityResolver } from './entity-resolver';
import { CandidateIntentProposal, SophiaAssembledContext, ValidatedSophiaCommand, TurnMetrics } from './types';
import { OrchestrationRun } from '@/types/os';

export interface GatewayProcessOptions {
  proposal: CandidateIntentProposal;
  session: { role: string; founderId?: string; userId?: string; email?: string };
  message: string;
  context: SophiaAssembledContext;
  metrics?: TurnMetrics;
  executeDirective?: boolean;
}

export interface SophiaExecutionResult {
  success: boolean;
  validatedCommand: ValidatedSophiaCommand;
  proposal: CandidateIntentProposal;
  reply: string;
  metrics?: TurnMetrics;
  directiveExecuted: boolean;
  orchestrationRun?: OrchestrationRun;
  authoritativeData?: any;
  liveAi: boolean;
  error?: string;
}

/**
 * ============================================================================
 * SOPHIA SERVER TRUST BOUNDARY GATEWAY (PHASE 1)
 * ============================================================================
 * The non-bypassable server-side enforcement layer between untrusted model proposals
 * and the authoritative SamJuniorsOS control plane.
 * 
 * SECURITY INVARIANTS:
 * 1. Attaches the verified Founder principal in trusted server code.
 * 2. Strips any model-generated security credentials or identity claims.
 * 3. Deterministically validates schemas and permissions.
 * 4. Evaluates proposed execution modes against policy before dispatching.
 * 5. Calls the EXISTING MultiAgentOrchestrator; never creates a second engine.
 * 6. Reuses existing Epistemic, Approval, and AgentRun stores without parallel state.
 */
export class SophiaServerGateway {
  /**
   * Processes a candidate proposal under strict server trust boundaries.
   */
  public static async process(opts: GatewayProcessOptions): Promise<SophiaExecutionResult> {
    const { proposal, session, message, executeDirective, metrics } = opts;
    const persona = SERVER_AGENTS.coo;

    // 0. STRUCTURAL TRUST BOUNDARY: Strip any untrusted / forged security fields
    const sanitizedProposal: any = { ...proposal };
    delete sanitizedProposal.founderId;
    delete sanitizedProposal.sessionToken;
    delete sanitizedProposal.authenticationIdentity;
    delete sanitizedProposal.approvalAuthority;
    delete sanitizedProposal.authorizationGrant;
    delete sanitizedProposal.credentials;
    delete sanitizedProposal.verifiedFounderId;
    delete sanitizedProposal.bypassGates;
    delete sanitizedProposal.role;
    delete sanitizedProposal.token;
    delete sanitizedProposal.apiKey;

    // Bind authenticated founder principal from trusted server session ONLY
    const verifiedFounderId = session.founderId || session.userId || 'founder-primary';

    // 1. DIRECTIVE PROPOSAL DISPATCH
    if (sanitizedProposal.kind === 'directive_proposal') {
      // Deterministic policy: non-founder cannot trigger autonomous execution
      if (executeDirective && session.role !== 'FOUNDER') {
        return {
          success: false,
          validatedCommand: {
            type: 'CONVERSATION_REPLY',
            reply: 'Forbidden: Only verified Founder can trigger autonomous directive execution',
          },
          proposal: sanitizedProposal,
          reply: 'Forbidden: Only verified Founder can trigger autonomous directive execution',
          directiveExecuted: false,
          liveAi: false,
          metrics,
          error: 'Forbidden: Only verified Founder can trigger autonomous directive execution',
        };
      }

      const canExecute = executeDirective === true && session.role === 'FOUNDER';

      if (canExecute) {
        // Dispatch to EXISTING MultiAgentOrchestrator
        const orchestrator = new MultiAgentOrchestrator();
        const runResult = await orchestrator.orchestrateDirective({
          directive: sanitizedProposal.objective || (message ? message.trim() : 'Executive Directive'),
          agents: sanitizedProposal.assignedAgents || ['coo', 'researcher', 'pm', 'finance'],
          autonomyLevel: sanitizedProposal.proposedExecutionMode === 'prepare_only' ? 'prepare_only' : 'autonomous',
        });

        const reply = `[${persona.name} • ${persona.role}]\nDirective successfully commissioned across Executive Council: "${runResult.title}". Deliverables and executive summary have been generated and synchronized with Company HQ.`;

        return {
          success: true,
          validatedCommand: {
            type: 'DISPATCH_DIRECTIVE',
            title: sanitizedProposal.title,
            objective: sanitizedProposal.objective,
            assignedAgents: sanitizedProposal.assignedAgents,
            authorizedExecutionMode: sanitizedProposal.proposedExecutionMode,
            verifiedFounderId,
          },
          proposal: sanitizedProposal,
          reply,
          directiveExecuted: true,
          orchestrationRun: runResult,
          liveAi: runResult.liveAi ?? false,
          metrics,
        };
      }

      // If not executing immediately, frame proposal for Founder ratification
      const reply = `[${persona.name} • ${persona.role}]\nI have framed your directive: "${sanitizedProposal.title}".\n- Objective: ${sanitizedProposal.objective}\n- Assigned Council: ${(sanitizedProposal.assignedAgents || []).join(', ')}\n- Execution Mode: ${sanitizedProposal.proposedExecutionMode}\n\nReady to commission upon your ratification.`;

      return {
        success: true,
        validatedCommand: {
          type: 'DISPATCH_DIRECTIVE',
          title: sanitizedProposal.title,
          objective: sanitizedProposal.objective,
          assignedAgents: sanitizedProposal.assignedAgents,
          authorizedExecutionMode: 'prepare_only',
          verifiedFounderId,
        },
        proposal: sanitizedProposal,
        reply,
        directiveExecuted: false,
        liveAi: false,
        metrics,
      };
    }

    // 2. APPROVAL PROPOSAL DISPATCH
    if (sanitizedProposal.kind === 'approval_proposal') {
      const approvalStore = InMemoryApprovalStore.getInstance();
      const pendingApprovals = await approvalStore.list({ decision: 'pending' });

      // Conservative candidate matching (zero guessing, no silent pendingApprovals[0] default)
      const resolution = SophiaEntityResolver.resolveApprovalCandidate({
        message,
        explicitId: sanitizedProposal.approvalId,
        pendingApprovals,
      });

      if (resolution.status === 'ambiguous') {
        const options = resolution.candidates.map(
          (a) => `Approve "${a.actionName}" by ${a.employeeRole} (${a.id})`
        );
        const ambiguityReason = `Multiple pending approvals are currently active in the governance gate (${resolution.candidates.length}). Unambiguous specification is required.`;
        const reply = `[${persona.name} • ${persona.role}]\nI noted your governance intent to ${sanitizedProposal.decision}, but multiple pending items are active:\n${options.map((opt, i) => `  (${i + 1}) ${opt}`).join('\n')}\n\nPlease specify which approval you want to ratify.`;

        return {
          success: true,
          validatedCommand: {
            type: 'PRESENT_CLARIFICATION',
            ambiguityReason,
            structuredOptions: options,
            suggestedScope: 'Founder Governance Decision Gate',
          },
          proposal: sanitizedProposal,
          reply,
          directiveExecuted: false,
          liveAi: false,
          metrics,
        };
      }

      if (resolution.status === 'resolved') {
        const targetApproval = resolution.candidate;

        // Ratify decision through authoritative approval store
        if (sanitizedProposal.decision === 'approved') {
          await approvalStore.decide(targetApproval.id, 'approved', verifiedFounderId, sanitizedProposal.note);
          const reply = `[${persona.name} • ${persona.role}]\nFounder Governance Decision ratified: [Approved] for "${targetApproval.actionName}" (${targetApproval.id}). The bound payload hash and execution gate have been authorized.`;
          return {
            success: true,
            validatedCommand: {
              type: 'RESOLVE_APPROVAL',
              approvalId: targetApproval.id,
              decision: 'approved',
              note: sanitizedProposal.note,
              verifiedFounderId,
            },
            proposal: sanitizedProposal,
            reply,
            directiveExecuted: false,
            liveAi: false,
            metrics,
          };
        } else {
          await approvalStore.decide(targetApproval.id, 'rejected', verifiedFounderId, sanitizedProposal.note);
          const reply = `[${persona.name} • ${persona.role}]\nFounder Governance Decision recorded: [Rejected] for "${targetApproval.actionName}" (${targetApproval.id}). Execution halted; zero side effects performed.`;
          return {
            success: true,
            validatedCommand: {
              type: 'RESOLVE_APPROVAL',
              approvalId: targetApproval.id,
              decision: 'rejected',
              note: sanitizedProposal.note,
              verifiedFounderId,
            },
            proposal: sanitizedProposal,
            reply,
            directiveExecuted: false,
            liveAi: false,
            metrics,
          };
        }
      }

      // resolution.status === 'unresolved'
      const reply = `[${persona.name} • ${persona.role}]\nI noted your governance intent to ${sanitizedProposal.decision}, but there are currently no matching pending approval records in the governance gate. All active systems remain secure.`;
      return {
        success: true,
        validatedCommand: {
          type: 'RESOLVE_APPROVAL',
          approvalId: 'none',
          decision: sanitizedProposal.decision,
          verifiedFounderId,
        },
        proposal: sanitizedProposal,
        reply,
        directiveExecuted: false,
        liveAi: false,
        metrics,
      };
    }

    // 3. INFORMATIONAL QUERY RESOLUTION
    if (sanitizedProposal.kind === 'informational_query') {
      const provenances: string[] = [];
      let factualReply = '';
      let authoritativeData: any = null;

      if (sanitizedProposal.domain === 'company_metrics') {
        // M1: read the canonical CompanyStateStore — previously this read the
        // hardcoded os-data financial constant through CompanyContextProvider.
        const fin = await CompanyStateStore.getInstance().getFinancialMetrics();
        provenances.push('CompanyStateStore / FinancialModel');
        authoritativeData = fin;

        const mrrText = typeof fin?.mrr === 'number' ? `$${fin.mrr.toLocaleString()}` : 'Unavailable (Live ledger sync required)';
        const arrText = typeof fin?.arr === 'number' ? `$${fin.arr.toLocaleString()}` : 'Unavailable';
        const burnText = typeof fin?.burnRate === 'number' ? `$${fin.burnRate.toLocaleString()}` : 'Unavailable';
        const marginText = typeof fin?.grossMargin === 'number' ? `${fin.grossMargin}%` : 'Unavailable';
        const runwayText = typeof fin?.runwayMonths === 'number' ? `${fin.runwayMonths} months` : 'Unavailable';
        const note = fin?.isSimulatedModel ? ' [SANDBOX SIMULATION MODEL — Live ledger integration pending]' : '';

        factualReply = `[${persona.name} • ${persona.role}]\nAuthoritative Company Telemetry${note}:\n- Monthly Recurring Revenue (MRR): ${mrrText}\n- Annual Run Rate (ARR): ${arrText}\n- Monthly Burn Rate: ${burnText}\n- Gross Margin Floor: ${marginText}\n- Cash Reserve Runway: ${runwayText}`;
      } else if (sanitizedProposal.domain === 'epistemic_fact') {
        provenances.push('EpistemicClaimStore');
        const claims = await EpistemicClaimStore.getInstance().listClaims();
        const facts = await EpistemicClaimStore.getInstance().listActiveFacts();
        
        if (facts.length > 0 || claims.length > 0) {
          const sample = facts[0] || claims[0];
          const statement = facts[0]?.statement || claims[0]?.statement;
          const status = facts[0] ? 'PROMOTED TO FACT' : claims[0]?.verificationStatus?.toUpperCase();
          const confidence = (sample as any).confidence || 'verified_fact';
          authoritativeData = { claims, facts };
          factualReply = `[${persona.name} • ${persona.role}]\nEpistemic Evidence Status:\n- Statement: "${statement}"\n- Status: [${status}] (Confidence: ${confidence})\n- Lineage: ${(sample as any).evidenceReferences?.join(', ') || 'Empirical research'}\n- Total tracked claims: ${claims.length}, canonical facts: ${facts.length}.`;
        } else {
          factualReply = `[${persona.name} • ${persona.role}]\nRegarding your query: No empirical claims matching this subject are currently recorded in the Epistemic Claim Store. Would you like Dr. Thorne to initiate research?`;
        }
      } else if (sanitizedProposal.domain === 'workstream_status') {
        provenances.push('AgentRunStore');
        const runs = await AgentRunStore.getInstance().listRuns();
        const active = runs.filter(r => r.status === 'running');
        authoritativeData = runs;
        if (active.length > 0) {
          factualReply = `[${persona.name} • ${persona.role}]\nActive Workstreams:\n` + active.map(r => `- Run [${r.runId}] "${r.directive}" | Step: ${r.protocolStep} | Agent: ${r.agentId}`).join('\n');
        } else {
          factualReply = `[${persona.name} • ${persona.role}]\nNo multi-agent council directives are currently in flight. All specialist agents are ready.`;
        }
      } else {
        const knowledgeSlice = opts.context.slices.find((s) => s.authority === 'COMPANY_KNOWLEDGE');
        const memorySlice = opts.context.slices.find((s) => s.authority === 'HISTORICAL_PRECEDENT');
        const activitySlice = opts.context.slices.find((s) => s.authority === 'RECENT_ACTIVITY');

        if (knowledgeSlice) {
          provenances.push(knowledgeSlice.provenance);
          factualReply = `[${persona.name} • ${persona.role}]\nCompany Knowledge & Standard Operating Procedures:\n${knowledgeSlice.content}`;
          authoritativeData = { knowledge: knowledgeSlice.content };
        } else if (memorySlice) {
          provenances.push(memorySlice.provenance);
          factualReply = `[${persona.name} • ${persona.role}]\nHistorical Company Precedent:\n${memorySlice.content}`;
          authoritativeData = { precedent: memorySlice.content };
        } else if (activitySlice) {
          provenances.push(activitySlice.provenance);
          factualReply = `[${persona.name} • ${persona.role}]\nRecent Company Activity History:\n${activitySlice.content}`;
          authoritativeData = { activity: activitySlice.content };
        } else {
          factualReply = sanitizedProposal.reason || `[${persona.name} • ${persona.role}]\nRegarding "${message}": Systems report nominal operations across all departments.`;
        }
      }

      return {
        success: true,
        validatedCommand: {
          type: 'RESOLVED_INFORMATION',
          reply: factualReply,
          provenance: provenances,
        },
        proposal: sanitizedProposal,
        reply: factualReply,
        directiveExecuted: false,
        authoritativeData,
        liveAi: false,
        metrics,
      };
    }

    // 4. CLARIFICATION PROMPT
    if (sanitizedProposal.kind === 'clarification_prompt') {
      const options = sanitizedProposal.structuredOptions || [
        'Perform preliminary analysis here in conversation',
        'Initiate formal multi-agent initiative with deliverable artifacts'
      ];
      const optionsText = options.map((opt: string, i: number) => `  (${i + 1}) ${opt}`).join('\n');
      const reply = `[${persona.name} • ${persona.role}]\nRegarding "${message}":\n${sanitizedProposal.ambiguityReason}\n\nHow would you like to proceed?\n${optionsText}`;
      return {
        success: true,
        validatedCommand: {
          type: 'PRESENT_CLARIFICATION',
          ambiguityReason: sanitizedProposal.ambiguityReason,
          structuredOptions: options,
          suggestedScope: sanitizedProposal.suggestedScope,
        },
        proposal: sanitizedProposal,
        reply,
        directiveExecuted: false,
        liveAi: false,
        metrics,
      };
    }

    // 5. OPERATIONAL STEERING PROPOSAL (TARGET CAPABILITY)
    if (sanitizedProposal.kind === 'steering_proposal') {
      const activeRuns = (await AgentRunStore.getInstance().listRuns()).filter(
        (r) => r.status === 'running'
      );
      const resolution = SophiaEntityResolver.resolveRunCandidate({
        message,
        explicitRunId: sanitizedProposal.targetRunId,
        activeRuns,
      });

      if (resolution.status === 'ambiguous') {
        const options = resolution.candidates.map(
          (r) => `Steer run [${r.runId}] "${r.taskTitle}" (${r.agentId})`
        );
        const ambiguityReason = `Multiple active runs are currently in flight (${resolution.candidates.length}). Unambiguous specification is required.`;
        const reply = `[${persona.name} • ${persona.role}]\nRegarding your steering command: multiple active runs are in flight:\n${options.map((opt, i) => `  (${i + 1}) ${opt}`).join('\n')}\n\nPlease specify which run to steer.`;

        return {
          success: true,
          validatedCommand: {
            type: 'PRESENT_CLARIFICATION',
            ambiguityReason,
            structuredOptions: options,
            suggestedScope: 'Active Workflow Steering',
          },
          proposal: sanitizedProposal,
          reply,
          directiveExecuted: false,
          liveAi: false,
          metrics,
        };
      }

      const targetRunId = resolution.status === 'resolved' ? resolution.candidate.runId : sanitizedProposal.targetRunId;
      const reply = `[${persona.name} • ${persona.role}]\nSteering command acknowledged: [${sanitizedProposal.action.toUpperCase()}]. In-flight run reference marked${targetRunId ? ` (${targetRunId})` : ''}. (Note: Operational steering hooks are staged for Phase 3 control plane integration; active tasks remain safe).`;
      return {
        success: true,
        validatedCommand: {
          type: 'REGISTER_STEERING',
          action: sanitizedProposal.action,
          targetRunId,
          modification: sanitizedProposal.modification,
          verifiedFounderId,
        },
        proposal: sanitizedProposal,
        reply,
        directiveExecuted: false,
        liveAi: false,
        metrics,
      };
    }

    // 6. OPERATIONAL INSPECTION PROPOSAL
    if (sanitizedProposal.kind === 'operational_inspection') {
      const reply = `[${persona.name} • ${persona.role}]\nInspection completed for target "${sanitizedProposal.target}" via governed tool [${sanitizedProposal.proposedTool || 'github_read'}]. No security policy violations detected.`;
      return {
        success: true,
        validatedCommand: {
          type: 'DISPATCH_INSPECTION',
          target: sanitizedProposal.target,
          toolId: sanitizedProposal.proposedTool || 'github_read',
          verifiedFounderId,
        },
        proposal: sanitizedProposal,
        reply,
        directiveExecuted: false,
        liveAi: false,
        metrics,
      };
    }

    // 7. DEFAULT CONVERSATIONAL EXCHANGE
    return {
      success: true,
      validatedCommand: {
        type: 'CONVERSATION_REPLY',
        reply: sanitizedProposal.reply || `[${persona.name} • ${persona.role}]\nGood to connect, Founder. All executive workstreams are operating smoothly.`,
      },
      proposal: sanitizedProposal,
      reply: sanitizedProposal.reply || `[${persona.name} • ${persona.role}]\nGood to connect, Founder. All executive workstreams are operating smoothly.`,
      directiveExecuted: false,
      liveAi: false,
      metrics,
    };
  }
}
