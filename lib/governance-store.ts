'use client';

import { CompanyDecision, AttentionItem } from '@/types/os';
import { INITIAL_COMPANY_DECISIONS, INITIAL_ATTENTION_ITEMS } from '@/lib/os-data';
import { dispatchOSNotification } from '@/components/os/IconHelper';

export type GovernanceActionType = 'approve' | 'reject' | 'request_revision';

export interface GovernanceEventDetail {
  action: GovernanceActionType;
  entityType: 'decision' | 'attention_item';
  entityId: string;
  revisionNote?: string;
  resolvedBy?: string;
}

export interface GovernanceState {
  decisions: CompanyDecision[];
  attentionItems: AttentionItem[];
}

// In-memory canonical cache for the active browser session
let cachedDecisions: CompanyDecision[] = [...INITIAL_COMPANY_DECISIONS];
let cachedAttentionItems: AttentionItem[] = [...INITIAL_ATTENTION_ITEMS];

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[GovernanceStore] Listener error:', e);
    }
  });
}

export const GovernanceStore = {
  getDecisions(): CompanyDecision[] {
    return [...cachedDecisions];
  },

  getAttentionItems(): AttentionItem[] {
    return [...cachedAttentionItems];
  },

  getPendingDecisionsCount(): number {
    return cachedDecisions.filter((d) => d.status === 'pending_approval').length;
  },

  getPendingAttentionCount(): number {
    return cachedAttentionItems.filter((a) => a.status === 'pending' || a.founderActionRequired).length;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Add a new decision generated autonomously by an employee or council
   */
  addDecision(decision: CompanyDecision): void {
    if (cachedDecisions.some((d) => d.id === decision.id)) return;
    cachedDecisions = [decision, ...cachedDecisions];
    notifyListeners();
    this.broadcastEvent({
      action: 'approve', // placeholder to notify
      entityType: 'decision',
      entityId: decision.id,
    });
    
    dispatchOSNotification({
      title: 'New Decision Requires Approval',
      message: `${decision.title}`,
      type: 'system',
      agent: 'Executive Council'
    });
  },

  /**
   * Add a new attention item requiring founder escalation
   */
  addAttentionItem(item: AttentionItem): void {
    if (cachedAttentionItems.some((a) => a.id === item.id)) return;
    cachedAttentionItems = [item, ...cachedAttentionItems];
    notifyListeners();
    this.broadcastEvent({
      action: 'approve',
      entityType: 'attention_item',
      entityId: item.id,
    });
    
    dispatchOSNotification({
      title: 'Action Required',
      message: `${item.title}`,
      type: 'system',
      agent: 'Company HQ'
    });
  },

  /**
   * Handle Decision Governance Action (approve, reject, request_revision)
   */
  handleDecisionAction(
    decisionId: string,
    action: GovernanceActionType,
    revisionNote?: string
  ): { success: boolean; decision?: CompanyDecision; error?: string } {
    const target = cachedDecisions.find((d) => d.id === decisionId);
    if (!target) {
      return { success: false, error: `Decision with ID "${decisionId}" not found in governance registry.` };
    }

    const nowIso = new Date().toISOString();
    let newStatus: CompanyDecision['status'] = 'approved';

    if (action === 'approve') {
      newStatus = 'approved';
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'request_revision') {
      newStatus = 'revision_requested';
    }

    cachedDecisions = cachedDecisions.map((dec) => {
      if (dec.id === decisionId) {
        return {
          ...dec,
          status: newStatus,
          founderApprovalRequired: action === 'approve' || action === 'reject' ? false : true,
          resolvedAt: nowIso,
          resolvedBy: 'Founder',
          resolutionNote: revisionNote || (action === 'approve' ? 'Ratified & authorized by Founder.' : action === 'reject' ? 'Rejected by Founder.' : 'Revision requested by Founder.'),
        };
      }
      return dec;
    });

    const updatedDecision = cachedDecisions.find((d) => d.id === decisionId);
    notifyListeners();
    this.broadcastEvent({
      action,
      entityType: 'decision',
      entityId: decisionId,
      revisionNote,
      resolvedBy: 'Founder',
    });

    return { success: true, decision: updatedDecision };
  },

  /**
   * Handle Attention Item Governance Action (approve, reject, request_revision, dismiss)
   */
  handleAttentionAction(
    itemId: string,
    action: GovernanceActionType | 'dismiss',
    revisionNote?: string
  ): { success: boolean; item?: AttentionItem; error?: string } {
    const target = cachedAttentionItems.find((a) => a.id === itemId);
    if (!target) {
      return { success: false, error: `Attention item with ID "${itemId}" not found in governance registry.` };
    }

    const nowIso = new Date().toISOString();

    if (action === 'dismiss') {
      cachedAttentionItems = cachedAttentionItems.filter((a) => a.id !== itemId);
    } else {
      let newStatus: AttentionItem['status'] = 'approved';
      if (action === 'approve') {
        newStatus = 'approved';
      } else if (action === 'reject') {
        newStatus = 'rejected';
      } else if (action === 'request_revision') {
        newStatus = 'revision_requested';
      }

      cachedAttentionItems = cachedAttentionItems.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            status: newStatus,
            founderActionRequired: action === 'approve' || action === 'reject' ? false : true,
            resolvedAt: nowIso,
            resolvedBy: 'Founder',
            resolutionNote: revisionNote || (action === 'approve' ? 'Ratified by Founder.' : action === 'reject' ? 'Rejected by Founder.' : 'Revision requested by Founder.'),
          };
        }
        return item;
      });
    }

    const updatedItem = cachedAttentionItems.find((a) => a.id === itemId);
    notifyListeners();
    this.broadcastEvent({
      action: action === 'dismiss' ? 'reject' : action,
      entityType: 'attention_item',
      entityId: itemId,
      revisionNote,
      resolvedBy: 'Founder',
    });

    return { success: true, item: updatedItem };
  },

  broadcastEvent(detail: GovernanceEventDetail): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('samjuniors-governance-updated', {
          detail,
        })
      );
    }
  },
};
