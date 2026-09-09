import { AppId, OSNotification } from '@/types/os';
import { playOSSound } from '@/components/os/IconHelper';

export type NotificationCategory = 'ai_employee' | 'system_event' | 'company_update';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ToastItem {
  id: string;
  notification: OSNotification;
  durationMs: number;
  remainingMs: number;
  isPaused: boolean;
  createdAt: number;
}

export interface NotificationStoreState {
  notifications: OSNotification[];
  activeToasts: ToastItem[];
  toastsEnabled: boolean;
  soundEnabled: boolean;
  filterCategory: 'all' | NotificationCategory;
  searchQuery: string;
}

export interface DispatchNotificationOptions {
  title: string;
  message: string;
  type?: 'agent' | 'system' | 'finance' | 'deal' | 'company' | 'governance' | 'security';
  category?: NotificationCategory;
  priority?: NotificationPriority;
  agent?: string;
  actionable?: boolean;
  actionLabel?: string;
  appTarget?: AppId;
  metadata?: Record<string, any>;
  showToast?: boolean;
  toastDurationMs?: number;
}

const DEFAULT_NOTIFICATIONS: OSNotification[] = [
  {
    id: 'notif-init-1',
    title: 'Executive AI Workforce Online',
    message: 'Sophia Vance (COO), Dr. Aris Thorne (Research), Maya Lin (PM), and Julian Vance (Finance) are online in Safe Sandbox mode.',
    time: 'Just now',
    type: 'agent',
    category: 'ai_employee',
    priority: 'high',
    agent: 'Executive Council',
    read: false,
    actionable: true,
    actionLabel: 'Open Workforce',
    appTarget: 'workforce',
    createdAt: Date.now() - 60000,
  },
  {
    id: 'notif-init-2',
    title: 'Strategic OKR Proposal Drafted',
    message: 'Sophia Vance finalized the Self-Serve Enterprise Tier strategic package for Founder review.',
    time: '12m ago',
    type: 'company',
    category: 'company_update',
    priority: 'normal',
    agent: 'Sophia Vance (COO)',
    read: false,
    actionable: true,
    actionLabel: 'Review in Governance',
    appTarget: 'company',
    createdAt: Date.now() - 720000,
  },
  {
    id: 'notif-init-3',
    title: 'Side-Effect Gate Active',
    message: 'All external API dispatches and transactional operations require explicit Founder authorization token.',
    time: '45m ago',
    type: 'system',
    category: 'system_event',
    priority: 'normal',
    agent: 'Central Gate',
    read: true,
    actionable: true,
    actionLabel: 'View Settings',
    appTarget: 'settings',
    createdAt: Date.now() - 2700000,
  },
];

type Listener = () => void;

class NotificationStoreImpl {
  private static instance: NotificationStoreImpl;
  private state: NotificationStoreState = {
    notifications: [...DEFAULT_NOTIFICATIONS],
    activeToasts: [],
    toastsEnabled: true,
    soundEnabled: true,
    filterCategory: 'all',
    searchQuery: '',
  };

  private listeners: Set<Listener> = new Set();
  private toastTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    // Listen for custom window event for backward compatibility
    if (typeof window !== 'undefined') {
      window.addEventListener('samjuniors-os-notification', ((e: CustomEvent<OSNotification>) => {
        if (e.detail && !this.state.notifications.some((n) => n.id === e.detail.id)) {
          this.internalAdd(e.detail, true);
        }
      }) as EventListener);
    }
  }

  public static getInstance(): NotificationStoreImpl {
    if (!NotificationStoreImpl.instance) {
      NotificationStoreImpl.instance = new NotificationStoreImpl();
    }
    return NotificationStoreImpl.instance;
  }

  public getState(): NotificationStoreState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('Error in NotificationStore listener:', err);
      }
    });
  }

  public getUnreadCount(): number {
    return this.state.notifications.filter((n) => !n.read).length;
  }

  public setFilterCategory(category: 'all' | NotificationCategory) {
    this.state.filterCategory = category;
    this.notify();
  }

  public setSearchQuery(query: string) {
    this.state.searchQuery = query;
    this.notify();
  }

  public setToastsEnabled(enabled: boolean) {
    this.state.toastsEnabled = enabled;
    if (!enabled) {
      this.clearAllToasts();
    }
    this.notify();
  }

  public setSoundEnabled(enabled: boolean) {
    this.state.soundEnabled = enabled;
    this.notify();
  }

  private determineCategory(opts: DispatchNotificationOptions): NotificationCategory {
    if (opts.category) return opts.category;
    if (opts.type === 'agent') return 'ai_employee';
    if (opts.type === 'company' || opts.type === 'deal' || opts.type === 'finance') return 'company_update';
    return 'system_event';
  }

  public dispatch(opts: DispatchNotificationOptions): OSNotification {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const category = this.determineCategory(opts);
    const priority = opts.priority || (category === 'system_event' ? 'high' : 'normal');

    const notification: OSNotification = {
      id,
      title: opts.title,
      message: opts.message,
      time: 'Just now',
      type: opts.type || (category === 'ai_employee' ? 'agent' : category === 'company_update' ? 'company' : 'system'),
      category,
      priority,
      agent: opts.agent,
      read: false,
      actionable: opts.actionable !== undefined ? opts.actionable : !!opts.appTarget,
      actionLabel: opts.actionLabel || (opts.appTarget ? `Open ${opts.appTarget.charAt(0).toUpperCase() + opts.appTarget.slice(1)}` : undefined),
      appTarget: opts.appTarget,
      metadata: opts.metadata,
      createdAt: Date.now(),
    };

    const shouldToast = opts.showToast !== false && this.state.toastsEnabled;
    const duration = opts.toastDurationMs || (priority === 'critical' ? 8000 : priority === 'high' ? 6000 : 4500);

    this.internalAdd(notification, shouldToast, duration);

    // Play sound if enabled
    if (this.state.soundEnabled) {
      try {
        playOSSound('notification');
      } catch {
        // audio might be blocked before first user gesture
      }
    }

    // Broadcast globally on window for any legacy listeners
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('samjuniors-os-notification', { detail: notification }));
      } catch {
        // ignore
      }
    }

    return notification;
  }

  private internalAdd(notification: OSNotification, shouldToast = true, toastDuration = 4500) {
    // Prepend to list, keeping max 60 items
    const nextList = [notification, ...this.state.notifications.filter((n) => n.id !== notification.id)].slice(0, 60);
    this.state.notifications = nextList;

    if (shouldToast && this.state.toastsEnabled) {
      const toastItem: ToastItem = {
        id: `toast-${notification.id}`,
        notification,
        durationMs: toastDuration,
        remainingMs: toastDuration,
        isPaused: false,
        createdAt: Date.now(),
      };

      // Keep max 3 visible toasts on screen to prevent viewport overflow
      const currentToasts = this.state.activeToasts.slice(-2);
      this.state.activeToasts = [...currentToasts, toastItem];

      this.scheduleToastDismiss(toastItem.id, toastDuration);
    }

    this.notify();
  }

  private scheduleToastDismiss(toastId: string, durationMs: number) {
    if (this.toastTimers.has(toastId)) {
      clearTimeout(this.toastTimers.get(toastId)!);
    }

    const timer = setTimeout(() => {
      this.dismissToast(toastId);
    }, durationMs);

    this.toastTimers.set(toastId, timer);
  }

  public dismissToast(toastId: string) {
    if (this.toastTimers.has(toastId)) {
      clearTimeout(this.toastTimers.get(toastId)!);
      this.toastTimers.delete(toastId);
    }
    this.state.activeToasts = this.state.activeToasts.filter((t) => t.id !== toastId);
    this.notify();
  }

  public pauseToast(toastId: string) {
    const toast = this.state.activeToasts.find((t) => t.id === toastId);
    if (toast) {
      toast.isPaused = true;
      if (this.toastTimers.has(toastId)) {
        clearTimeout(this.toastTimers.get(toastId)!);
        this.toastTimers.delete(toastId);
      }
      this.notify();
    }
  }

  public resumeToast(toastId: string) {
    const toast = this.state.activeToasts.find((t) => t.id === toastId);
    if (toast) {
      toast.isPaused = false;
      this.scheduleToastDismiss(toastId, 2500); // give 2.5s once un-hovered
      this.notify();
    }
  }

  public clearAllToasts() {
    this.toastTimers.forEach((timer) => clearTimeout(timer));
    this.toastTimers.clear();
    this.state.activeToasts = [];
    this.notify();
  }

  public markAsRead(id: string) {
    this.state.notifications = this.state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.notify();
  }

  public markAsUnread(id: string) {
    this.state.notifications = this.state.notifications.map((n) => (n.id === id ? { ...n, read: false } : n));
    this.notify();
  }

  public markAllAsRead() {
    this.state.notifications = this.state.notifications.map((n) => ({ ...n, read: true }));
    this.notify();
  }

  public dismissNotification(id: string) {
    this.state.notifications = this.state.notifications.filter((n) => n.id !== id);
    // also dismiss any active toast for this notification
    const matchingToast = this.state.activeToasts.find((t) => t.notification.id === id);
    if (matchingToast) {
      this.dismissToast(matchingToast.id);
    }
    this.notify();
  }

  public clearAll() {
    this.clearAllToasts();
    this.state.notifications = [];
    this.notify();
  }

  public resetToDefaults() {
    this.clearAllToasts();
    this.state.notifications = [...DEFAULT_NOTIFICATIONS];
    this.state.filterCategory = 'all';
    this.state.searchQuery = '';
    this.notify();
  }

  // ==========================================================================
  // CONTEXTUAL SIMULATION & TRIGGER HELPERS
  // ==========================================================================

  public simulateAIEmployeeAction(preset?: 'coo' | 'researcher' | 'pm' | 'finance') {
    const presets = [
      {
        agent: 'Sophia Vance (COO)',
        title: 'Executive Sync Completed',
        message: 'Operational plan for Enterprise Multi-Tenant Deployment is ready. 3 actionable directives queued.',
        type: 'agent' as const,
        category: 'ai_employee' as const,
        priority: 'high' as const,
        appTarget: 'workforce' as const,
        actionLabel: 'Open Workforce',
      },
      {
        agent: 'Dr. Aris Thorne (Research)',
        title: 'Market Intelligence Brief Synthesized',
        message: 'Deep competitive analysis on Agentic Workflow orchestration completed with 94% epistemic confidence.',
        type: 'agent' as const,
        category: 'ai_employee' as const,
        priority: 'normal' as const,
        appTarget: 'research' as const,
        actionLabel: 'View Research',
      },
      {
        agent: 'Maya Lin (Head of Product)',
        title: 'PRD Spec Published',
        message: 'Drafted Product Requirements Document for "Context-Aware Agent Autonomy Controls v2.4".',
        type: 'agent' as const,
        category: 'ai_employee' as const,
        priority: 'normal' as const,
        appTarget: 'products' as const,
        actionLabel: 'Inspect PRD',
      },
      {
        agent: 'Julian Vance (VP Finance)',
        title: 'Token Compute Cost Optimized',
        message: 'Automated cache policy reduced monthly inference burn by 18.4%. Margin increased to 82.1%.',
        type: 'finance' as const,
        category: 'ai_employee' as const,
        priority: 'normal' as const,
        appTarget: 'finance' as const,
        actionLabel: 'View Financials',
      },
    ];

    const selected = preset
      ? presets.find((p) => p.agent.toLowerCase().includes(preset)) || presets[0]
      : presets[Math.floor(Math.random() * presets.length)];

    return this.dispatch(selected);
  }

  public simulateSystemEvent() {
    const systemEvents = [
      {
        title: 'Side-Effect Gate: Approval Required',
        message: 'Outbound transactional payload to external webhook endpoint requires Founder single-use authorization.',
        type: 'system' as const,
        category: 'system_event' as const,
        priority: 'critical' as const,
        agent: 'Central Auth Gate',
        appTarget: 'settings' as const,
        actionLabel: 'Authorize Action',
      },
      {
        title: 'Autonomous Pulse Synchronized',
        message: 'Executive swarm heartbeat completed 10-second sync cycle across all 4 worker threads.',
        type: 'system' as const,
        category: 'system_event' as const,
        priority: 'low' as const,
        agent: 'Runtime Kernel',
        appTarget: 'workforce' as const,
        actionLabel: 'View Telemetry',
      },
      {
        title: 'Safe Sandbox Guard Active',
        message: 'Memory boundary check passed. Zero unauthorized external mutations detected.',
        type: 'security' as const,
        category: 'system_event' as const,
        priority: 'normal' as const,
        agent: 'Constitutional Auditor',
        appTarget: 'company' as const,
        actionLabel: 'View Governance',
      },
    ];

    const selected = systemEvents[Math.floor(Math.random() * systemEvents.length)];
    return this.dispatch(selected);
  }

  public simulateCompanyUpdate() {
    const companyUpdates = [
      {
        title: 'Strategic Decision Pending Sign-Off',
        message: 'Initiative "Autonomous Enterprise CRM" requires Founder ratification before sprint kickoff.',
        type: 'company' as const,
        category: 'company_update' as const,
        priority: 'high' as const,
        agent: 'Company Governance',
        appTarget: 'company' as const,
        actionLabel: 'Review Decision',
      },
      {
        title: 'Customer Deal Milestone Reached',
        message: 'Nexus Global Enterprise transitioned to "Contract Review" stage for $84,000 ARR target.',
        type: 'deal' as const,
        category: 'company_update' as const,
        priority: 'normal' as const,
        agent: 'Autonomous CRM',
        appTarget: 'customers' as const,
        actionLabel: 'Inspect Pipeline',
      },
      {
        title: 'Quarterly OKR Progress: 78%',
        message: 'Key Result "Sub-100ms Agent Reaction Time" achieved and verified by Constitutional Suite.',
        type: 'company' as const,
        category: 'company_update' as const,
        priority: 'normal' as const,
        agent: 'Executive Council',
        appTarget: 'company' as const,
        actionLabel: 'View OKRs',
      },
    ];

    const selected = companyUpdates[Math.floor(Math.random() * companyUpdates.length)];
    return this.dispatch(selected);
  }
}

export const NotificationStore = NotificationStoreImpl.getInstance();
