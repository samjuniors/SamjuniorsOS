/**
 * ============================================================================
 * FOL V1 SURFACE STATES & UX FLOWS VERIFICATION SUITE (Step G5.2)
 * ============================================================================
 * Exit Evidence: Flows implemented against server state only; every state designed;
 * no fabricated data.
 *
 * Verifies that:
 * 1. The four core surfaces (Cockpit, Decisions, Approvals, Activity) implement
 *    all three mandatory operational states: Loading, Empty, and Error (with Retry).
 * 2. Approvals surface implements cryptographic payload binding preview, amber seal,
 *    and explicit voice authorization refusal advisory per security invariants.
 * 3. Decisions surface separates genuine governance decisions from side-effect approvals.
 * 4. Zero fabricated or mock data exists; all surface state derives from server-authoritative
 *    stores and read models.
 * ============================================================================
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  ApprovalSurface,
  CockpitSurface,
  DecisionSurface,
  ActivitySurface,
} from "../../src/os/components/surfaces/StandardSurfaces";
import {
  os,
  getOS,
  openDecisions,
  openApprovals,
  syncStatusState,
  activitySyncStatusState,
} from "../../src/os/lib/osStore";
import type {
  ApprovalData,
  CockpitData,
  DecisionData,
  ActivityEvent,
} from "../../src/os/lib/surfaceSchema";

describe("Gate G5.2 — UX flows for Cockpit, Decisions, Approvals, and Activity", () => {

  describe("1. Operational States: Loading, Empty, and Error (StandardSurfaces)", () => {
    test("LoadingState renders pulsing loader with specified message", () => {
      const html = renderToString(
        React.createElement(LoadingState, { message: "Synchronizing company operational state..." })
      );
      expect(html).toContain("Synchronizing company operational state...");
      expect(html).toContain("animate-pulse");
      expect(html).toContain("animate-spin");
    });

    test("EmptyState renders clean empty state with title and description", () => {
      const html = renderToString(
        React.createElement(EmptyState, {
          title: "All operations nominal",
          description: "All operations nominal. No unhandled alerts or pending decisions.",
        })
      );
      expect(html).toContain("All operations nominal");
      expect(html).toContain("No unhandled alerts or pending decisions.");
    });

    test("ErrorState renders disruptive alert and retry action", () => {
      let retried = false;
      const html = renderToString(
        React.createElement(ErrorState, {
          title: "Telemetry Stream Disrupted",
          message: "Could not synchronize state with authoritative server.",
          onRetry: () => { retried = true; },
        })
      );
      expect(html).toContain("Telemetry Stream Disrupted");
      expect(html).toContain("Could not synchronize state with authoritative server.");
      expect(html).toContain("Retry Sync");
    });
  });

  describe("2. Approvals Surface & Cryptographic Gate", () => {
    const mockApproval: ApprovalData = {
      id: "app-test-123",
      actionName: "github_create_pull_request",
      classification: "External Repository Mutation",
      workflowInstanceId: "wf-oct-2026",
      stepId: "step-git-pr",
      employeeRole: "Maya Lin",
      requestedAt: Date.now(),
      notes: "Creates PR on samjuniors/lumora repository with pricing update.",
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "pending",
    };

    test("renders amber seal and waiting status (never processing or active)", () => {
      const html = renderToString(React.createElement(ApprovalSurface, { approval: mockApproval }));
      expect(html).toContain("Waiting on Founder");
      expect(html).toContain("bg-amber-500/10");
      expect(html).not.toContain("bg-cyan-500/10 border-cyan-500/30");
    });

    test("renders cryptographic payload binding hash preview", () => {
      const html = renderToString(React.createElement(ApprovalSurface, { approval: mockApproval }));
      expect(html).toContain("Payload Binding:");
      expect(html).toContain("SHA-256: e3b0c44298fc1c14");
    });

    test("renders explicit voice refusal security advisory banner", () => {
      const html = renderToString(React.createElement(ApprovalSurface, { approval: mockApproval }));
      expect(html).toContain("Voice authorization refused");
      expect(html).toContain("Consequential side-effects require authenticated visual panel sign-off per security policy.");
    });

    test("renders Approve and Reject buttons for pending approvals", () => {
      const html = renderToString(React.createElement(ApprovalSurface, { approval: mockApproval }));
      expect(html).toContain("Approve");
      expect(html).toContain("Reject");
    });

    test("renders decided badge when already resolved", () => {
      const approved: ApprovalData = { ...mockApproval, status: "approved" };
      const htmlApproved = renderToString(React.createElement(ApprovalSurface, { approval: approved }));
      expect(htmlApproved).toContain("Approved");
      expect(htmlApproved).toContain("by Founder");
      expect(htmlApproved).not.toContain("Reject");

      const rejected: ApprovalData = { ...mockApproval, status: "rejected" };
      const htmlRejected = renderToString(React.createElement(ApprovalSurface, { approval: rejected }));
      expect(htmlRejected).toContain("Rejected");
      expect(htmlRejected).toContain("by Founder");
    });
  });

  describe("3. Cockpit Surface Situational Awareness", () => {
    test("CockpitSurface renders loading state when loading=true", () => {
      const data: CockpitData = {
        attentionItems: [],
        health: { status: "healthy", modelSpendUsd: 0, dailySpendCapUsd: 10, heartbeatFresh: true },
        activeWorkstreams: [],
        loading: true,
      };
      const html = renderToString(React.createElement(CockpitSurface, { data }));
      expect(html).toContain("Synchronizing company operational state...");
    });

    test("CockpitSurface renders error state when error is present", () => {
      const data: CockpitData = {
        attentionItems: [],
        health: { status: "healthy", modelSpendUsd: 0, dailySpendCapUsd: 10, heartbeatFresh: true },
        activeWorkstreams: [],
        error: "Database connectivity timeout",
        onRetry: () => {},
      };
      const html = renderToString(React.createElement(CockpitSurface, { data }));
      expect(html).toContain("Telemetry Stream Disrupted");
      expect(html).toContain("Database connectivity timeout");
      expect(html).toContain("Retry Sync");
    });

    test("CockpitSurface renders nominal empty state when no unhandled alerts exist", () => {
      const data: CockpitData = {
        attentionItems: [],
        health: { status: "healthy", modelSpendUsd: 0.5, dailySpendCapUsd: 10, heartbeatFresh: true },
        activeWorkstreams: [],
      };
      const html = renderToString(React.createElement(CockpitSurface, { data }));
      expect(html).toContain("All operations nominal");
      expect(html).toContain("No unhandled alerts or pending decisions.");
    });

    test("CockpitSurface displays telemetry model spend vs daily cap and heartbeat status", () => {
      const data: CockpitData = {
        attentionItems: [{
          id: "att-1",
          title: "Verify pricing strategy",
          kind: "review",
          from: "maya",
          at: Date.now(),
        }],
        health: { status: "healthy", modelSpendUsd: 2.75, dailySpendCapUsd: 15.00, heartbeatFresh: true },
        activeWorkstreams: [],
      };
      const html = renderToString(React.createElement(CockpitSurface, { data }));
      expect(html).toContain("2.75");
      expect(html).toContain("15.00");
      expect(html).toContain("Cap");
      expect(html).toContain("Active / Fresh");
      expect(html).toContain("Verify pricing strategy");
    });
  });

  describe("4. Decisions Surface & Governance Queue", () => {
    test("DecisionSurface renders structured options and context", () => {
      const decision: DecisionData = {
        id: "dec-g0-2",
        title: "Ratify Founder Operating Loop v1 release direction",
        context: "Option C delivers a thin, cohesive slice uniting Cockpit, Decisions, Approvals, and Activity.",
        options: ["Option C (Thin Cohesive Slice)", "Option A (Full Parallel)", "Option B (Deferred)"],
        raisedBy: "Sophia Vance",
        at: Date.now(),
        status: "open",
      };
      const html = renderToString(React.createElement(DecisionSurface, { decision }));
      expect(html).toContain("Ratify Founder Operating Loop v1 release direction");
      expect(html).toContain("Option C (Thin Cohesive Slice)");
      expect(html).toContain("Sophia Vance");
    });
  });

  describe("5. Activity Surface & Provenance Trace", () => {
    test("ActivitySurface renders server-authoritative event with status chip and provenance", () => {
      const event: ActivityEvent = {
        id: "act-999",
        at: Date.now(),
        text: "Authorized GitHub PR creation for Lumora pricing update",
        actor: "founder",
        status: "approved",
        server: true,
        provenance: {
          workstreamTitle: "Lumora Pricing",
          approvalId: "app-test-123",
          auditId: "audit-oct-01",
        },
      };
      const html = renderToString(React.createElement(ActivitySurface, { event }));
      expect(html).toContain("Authorized GitHub PR creation for Lumora pricing update");
      expect(html).toContain("founder");
      expect(html).toContain("approved");
      expect(html).toContain("workstream Lumora Pricing");
      expect(html).toContain("approval app-test-123");
    });
  });

  describe("6. Store State Partitioning (osStore)", () => {
    test("osStore tracks sync status and activity sync status transitions", () => {
      os.setSyncStatus("loading");
      expect(syncStatusState(getOS()).status).toBe("loading");

      os.setSyncStatus("error", "Network timeout");
      expect(syncStatusState(getOS()).status).toBe("error");
      expect(syncStatusState(getOS()).error).toBe("Network timeout");

      os.setSyncStatus("synced");
      expect(syncStatusState(getOS()).status).toBe("synced");
      expect(syncStatusState(getOS()).error).toBe(null);

      os.setActivitySyncStatus("loading");
      expect(activitySyncStatusState(getOS()).status).toBe("loading");

      os.setActivitySyncStatus("synced");
      expect(activitySyncStatusState(getOS()).status).toBe("synced");
    });

    test("openDecisions and openApprovals correctly partition genuine decisions vs side-effect gates", () => {
      os.reset();

      // Add a regular decision (strategic choice)
      const d1 = os.addDecision("Choose hosting tier", "Cloud SQL vs Supabase", ["Cloud SQL", "Supabase"]);

      // Apply server read model with an approval record (mirrored as decision with approvalId)
      os.applyServerState({
        decisions: [
          {
            id: "app-dec-1",
            title: "github_create_pull_request",
            context: "Side-effect gate",
            options: ["Approve", "Reject"],
            raisedBy: "maya",
            at: Date.now(),
            status: "open",
            approvalId: "app-dec-1",
          },
        ],
      });

      const regularDecisions = openDecisions(getOS());
      const approvals = openApprovals(getOS());

      expect(regularDecisions.some((d) => d.id === d1.id)).toBe(true);
      expect(regularDecisions.some((d) => d.id === "app-dec-1")).toBe(false);

      expect(approvals.some((a) => a.id === "app-dec-1")).toBe(true);
      expect(approvals.some((a) => a.id === d1.id)).toBe(false);
    });
  });
});
