import { useEffect, useRef, useState } from 'react';
import Scene, { agentDefs } from './Scene';
import './index.css';

type IconName =
  | 'core'
  | 'grid'
  | 'activity'
  | 'list'
  | 'arrow'
  | 'chevron'
  | 'console'
  | 'settings'
  | 'info'
  | 'pause'
  | 'play'
  | 'bolt'
  | 'broadcast'
  | 'close'
  | 'expand'
  | 'reset'
  | 'search'
  | 'check'
  | 'signal'
  | 'memory'
  | 'nodes'
  | 'shield'
  | 'external'
  | 'message';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    core: (
      <>
        <path d="m12 2 8 5v10l-8 5-8-5V7Z" />
        <path d="m4 7 8 5 8-5M12 12v10m0-20v10M4 17l8-5 8 5" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    activity: <path d="M2 12h4l3-7 5 14 3-7h5" />,
    list: (
      <>
        <path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    console: (
      <>
        <path d="m4 6 6 6-6 6m9 0h7" />
      </>
    ),
    settings: (
      <>
        <path d="M3 7h8m4 0h6M3 17h3m4 0h11" />
        <circle cx="13" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
    broadcast: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    signal: (
      <>
        <path d="M5 20v-4m5 4v-8m5 8V8m5 12V4" />
      </>
    ),
    memory: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3" />
        <rect x="9" y="9" width="6" height="6" />
      </>
    ),
    nodes: (
      <>
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="18" r="3" />
        <circle cx="19" cy="18" r="3" />
        <path d="m10 8-4 7m8-7 4 7M8 18h8" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 11 3 3 5-5" />
      </>
    ),
    external: (
      <>
        <path d="M13 4h7v7m0-7-10 10M8 4H4v16h16v-4" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    )
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type Agent = typeof agentDefs[number] & { progress: number; done: number; active: boolean };
type Event = { name: string; text: string; color: string; time: Date };
type Settings = { reduced: boolean; labels: boolean; quality: string; rate: number; theme?: 'solar' | 'luna' };
const defaultSettings: Settings = { reduced: false, labels: true, quality: 'high', rate: 100, theme: 'solar' };

function readSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('samjuniors-core-settings') || '{}');
    return {
      reduced: typeof s.reduced === 'boolean' ? s.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches,
      labels: typeof s.labels === 'boolean' ? s.labels : true,
      quality: ['high', 'low'].includes(s.quality) ? s.quality : 'high',
      rate: typeof s.rate === 'number' ? Math.max(0, Math.min(200, s.rate)) : 100,
      theme: s.theme === 'luna' ? 'luna' : 'solar'
    };
  } catch {
    return defaultSettings;
  }
}

const initialEvents: Event[] = [
  { name: 'SOPHIA', text: 'Decomposed founder directive into 9-Step DAG (Understand → Plan)', color: '#a855f7', time: new Date(Date.now() - 15000) },
  { name: 'THORNE', text: 'Market intelligence memo filed with 4 empirical citations', color: '#fbbf24', time: new Date(Date.now() - 48000) },
  { name: 'SAMJUNIORS CORE', text: 'Constitutional invariant gate verified 80.0% gross margin floor', color: '#34d399', time: new Date(Date.now() - 85000) },
  { name: 'SOPHIA', text: 'Prepared executive deliverable package awaiting founder ratification', color: '#a855f7', time: new Date(Date.now() - 130000) },
  { name: 'SAMJUNIORS CORE', text: 'Company Brain memory checkpoint committed to durable store', color: '#d8b477', time: new Date(Date.now() - 190000) },
];

type ContextMode = 'idle' | 'work' | 'approval' | 'audit' | 'telemetry';

type QueueTask = {
  id: string;
  category: 'current' | 'next' | 'then' | 'waiting' | 'completed';
  title: string;
  status: 'IN PROGRESS' | 'QUEUED' | 'WAITING RATIFICATION' | 'COMPLETED';
  statusClass: 'status-current' | 'status-next' | 'status-waiting' | 'status-completed';
  ownerName: string;
  ownerCode: 'SOPHIA' | 'THORNE' | 'CORE';
  ownerRole: string;
  ownerColor: string;
  stepProgress?: string;
  percent?: number;
  currentStep?: string;
  nextStep?: string;
  thenStep?: string;
  waitingReason?: string;
  completedAt?: string;
  provenanceNote?: string;
  invariantStatus?: string;
  details: string;
};

const defaultQueueTasks: QueueTask[] = [
  {
    id: 'task-current-1',
    category: 'current',
    title: 'Directive Decomposition & Execution Plan Synthesis',
    status: 'IN PROGRESS',
    statusClass: 'status-current',
    ownerName: 'Sophia Vance',
    ownerCode: 'SOPHIA',
    ownerRole: 'COO & Executive Orchestrator',
    ownerColor: '#a855f7',
    stepProgress: 'Step 4 of 9',
    percent: 78,
    currentStep: 'Synthesizing market entry parameters and operating model assumptions',
    nextStep: 'Submit parameter bounds to SamJuniors Core invariant evaluator',
    thenStep: 'Compile final executive recommendation memo for founder ratification',
    invariantStatus: 'Nominal · Margin floor ≥ 80.0% satisfied',
    details: 'Sophia is running the 9-Step Directive Protocol. Grounding verified with 4 peer-reviewed citations from Dr. Thorne. Safety invariants verified against constitutional rules.'
  },
  {
    id: 'task-next-1',
    category: 'next',
    title: 'Constitutional Invariant Deterministic Evaluation Pass',
    status: 'QUEUED',
    statusClass: 'status-next',
    ownerName: 'SamJuniors Core',
    ownerCode: 'CORE',
    ownerRole: 'OS Invariant & Governance Layer',
    ownerColor: '#34d399',
    stepProgress: 'Step 5 of 9',
    currentStep: 'Awaiting parameter payload from Sophia (Step 4)',
    nextStep: 'Deterministic check: Single-use token binding & gross margin ≥ 80%',
    thenStep: 'Emit cryptographic validation token to working memory',
    invariantStatus: 'Automated fail-closed gate ready',
    details: 'Deterministic zero-bypass evaluation engine. Validates all financial, security, and authorization constraints before human ratification surface is mounted.'
  },
  {
    id: 'task-then-1',
    category: 'then',
    title: 'Executive Deliverable Compilation & Memory Checkpoint',
    status: 'QUEUED',
    statusClass: 'status-next',
    ownerName: 'Sophia Vance',
    ownerCode: 'SOPHIA',
    ownerRole: 'COO & Executive Orchestrator',
    ownerColor: '#a855f7',
    stepProgress: 'Step 6 & 7 of 9',
    currentStep: 'Pending Step 5 invariant verification',
    nextStep: 'Assemble executive memo, sensitivity matrix, and audit ledger',
    thenStep: 'Store immutable snapshot into Company Brain durable checkpoint',
    details: 'Synthesizes final readable documentation and commits state into local mock durable memory store.'
  },
  {
    id: 'task-wait-1',
    category: 'waiting',
    title: 'External Procurement & Sandbox Resource Release',
    status: 'WAITING RATIFICATION',
    statusClass: 'status-waiting',
    ownerName: 'SamJuniors Core',
    ownerCode: 'CORE',
    ownerRole: 'Founder Ratification Gate',
    ownerColor: '#f59e0b',
    stepProgress: 'Founder Gated',
    waitingReason: 'Consequential action requires human founder authorization. Execution halted in safe fail-closed state.',
    invariantStatus: 'Approval gate active (1 pending decision)',
    details: 'Human founder ratification required to authorize budget allocation beyond standard sandbox thresholds. Ratification can be performed directly from the Decision Gate.'
  },
  {
    id: 'task-comp-1',
    category: 'completed',
    title: 'Competitive Landscape & Market Grounding Memo',
    status: 'COMPLETED',
    statusClass: 'status-completed',
    ownerName: 'Dr. Aris Thorne',
    ownerCode: 'THORNE',
    ownerRole: 'Lead Research Specialist',
    ownerColor: '#fbbf24',
    completedAt: '14 minutes ago',
    provenanceNote: '4 peer-reviewed citations attached · Provenance SHA verified',
    invariantStatus: 'Invariant verified · Zero exfiltration',
    details: 'Dr. Thorne synthesized competitive intelligence, pricing elasticities, and empirical citations. Output stored in working memory for Sophia Step 4 planning.'
  },
  {
    id: 'task-comp-2',
    category: 'completed',
    title: 'Founder Directive Ingestion & DAG Schema Validation',
    status: 'COMPLETED',
    statusClass: 'status-completed',
    ownerName: 'SamJuniors Core',
    ownerCode: 'CORE',
    ownerRole: 'OS Invariant Parser',
    ownerColor: '#34d399',
    completedAt: '22 minutes ago',
    provenanceNote: 'Directive hash logged · Invariant tokens minted',
    invariantStatus: '100% schema integrity confirmed',
    details: 'Parsed high-level founder intent into structured 9-step directed acyclic graph (DAG) with explicit dependency nodes.'
  }
];

export default function App() {
  const [agents, setAgents] = useState<Agent[]>(() =>
    agentDefs.map(a => ({
      ...a,
      progress: a.name === 'SOPHIA' ? 78 : a.name === 'THORNE' ? 62 : 0,
      done: a.name === 'SOPHIA' ? 14 : a.name === 'THORNE' ? 11 : 0,
      active: a.isV1Active
    }))
  );
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState<'Overview' | 'Workforce monitor' | 'Audit stream'>('Overview');
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [burst, setBurst] = useState(0);
  const [reset, setReset] = useState(0);
  const [notice, setNotice] = useState('');
  const [launcher, setLauncher] = useState(false);
  const [query, setQuery] = useState('');
  const [activeContext, setActiveContext] = useState<ContextMode>('idle');
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [approvalPending, setApprovalPending] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>('task-current-1');
  const [queueTasks] = useState<QueueTask[]>(defaultQueueTasks);
  const [messages, setMessages] = useState([
    {
      who: 'sophia',
      text: '[Sophia Vance - COO] Good afternoon, Founder. Core intelligence mesh is calm and all constitutional invariants are nominal. Ready for your directive or inquiry.'
    }
  ]);
  const [command, setCommand] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const sophiaInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const activeV1Count = agents.filter(a => a.isV1Active && a.active).length;
  const focus = agents[0]; // Sophia Vance (COO)
  const agent = agents.find(a => a.name === selected);

  const notify = (text: string) => setNotice(text);
  const addEvent = (name: string, text: string, color = '#d8b477') =>
    setEvents(prev => [{ name, text, color, time: new Date() }, ...prev].slice(0, 80));

  const perform = (action: string) => {
    setBurst(Date.now());
    if (action === 'wake') {
      setAgents(prev =>
        prev.map(a => (a.isV1Active ? { ...a, active: true } : a))
      );
      addEvent('SAMJUNIORS CORE', 'Workforce v1 foundation active (Sophia & Thorne). 4 specialists held in governed standby', '#d8b477');
      notify('Workforce v1 foundation active (Sophia & Thorne). Deferred/planned roles remain in governed standby.');
    }
    if (action === 'diagnostic') {
      addEvent('SAMJUNIORS CORE', 'Constitutional invariant audit: PASS · All v1 safety boundaries nominal', '#34d399');
      notify('Constitutional invariant audit: PASS. 0 safety breaches across active v1 runtime gates.');
      setActiveContext('audit');
    }
    if (action === 'directive') {
      setBurst(Date.now());
      setAgents(prev =>
        prev.map(a =>
          a.name === 'SOPHIA' ? { ...a, progress: Math.min(100, a.progress + 6), done: a.done + 1 } : a
        )
      );
      addEvent('SOPHIA', 'Founder directive received · decomposed into 9-Step execution graph [Sandbox]', '#a855f7');
      notify('Directive dispatched to Sophia Vance (COO) in safe mock sandbox.');
      setActiveContext('work');
    }
    if (action === 'reset') {
      setReset(v => v + 1);
      notify('Front-facing orbital perspective reset.');
    }
  };

  // Calm session clock only - no fake rapid data loops
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      if (!paused) {
        setSeconds(s => s + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    try {
      localStorage.setItem('samjuniors-core-settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages, modal]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement).closest('input,textarea,select');
      if (e.key === 'Escape') {
        if (queueOpen) {
          setQueueOpen(false);
        } else if (modal || selected) {
          setModal(null);
          setSelected(null);
          setLauncher(false);
        } else if (activeContext !== 'idle') {
          setActiveContext('idle');
        } else if (rosterExpanded) {
          setRosterExpanded(false);
        }
      }
      if (editing) return;
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setQueueOpen(q => !q);
      }
      if (e.key === '/') {
        e.preventDefault();
        if (tab !== 'Overview') setTab('Overview');
        sophiaInputRef.current?.focus();
      }
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('button')) {
        e.preventDefault();
        setPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [modal, selected, activeContext, rosterExpanded, tab, queueOpen]);

  useEffect(() => {
    if (!modal && !selected) return;
    const before = document.activeElement as HTMLElement;
    const timer = setTimeout(() => {
      if (modal === 'console') inputRef.current?.focus();
      else modalRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }, 30);
    return () => {
      clearTimeout(timer);
      before?.focus();
    };
  }, [modal, selected]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = command.trim();
    if (!text) return;
    setCommand('');
    const c = text.toLowerCase();
    let reply = '[Sophia Vance - COO] Command not recognized. Type "help" or ask a question.';

    if (c === 'help' || c === '?') {
      reply = `[Sophia Vance - COO] Available capabilities in this calm prototype:
  directive <text> · status · queue · workforce · verify · approve · calm · what needs attention?
  ping <specialist> · pause · resume · reset · clear

Notice: Responses are synthesized locally for this UI prototype. Zero live external side-effects are performed.`;
    } else if (c.includes('attention') || c.includes('focus')) {
      if (approvalPending) {
        reply = `[Sophia Vance - COO] Attention required: 1 pending ratification. Executive memo & resource allocation awaiting founder authorization before commit.`;
        setActiveContext('approval');
      } else {
        reply = `[Sophia Vance - COO] The Core reports all systems calm. Currently supervising Step 4 (Plan) of our directive decomposition. Thorne's market memo is ratified. No critical invariant blocks.`;
      }
    } else if (c === 'status') {
      reply = `[Sophia Vance - COO] System status:
  - Active v1 Workforce: Sophia Vance (COO) & Dr. Aris Thorne (Research)
  - Governed Standby: Maya Lin (Product) & Julian Cruz (Finance) — v1 deferred
  - Target-State Architecture: Elena Rostova (Governance) & Marcus Vance (Systems) — v2+ planned
  - Epistemic Signals: Not connected (Live claims require Phase 3.3 Brain integration)
  - Governed Deliverables: Prototype mock artifacts (0 live DB records)
  - Constitutional Invariants: Enforced · Safe mock sandboxing active.`;
      setActiveContext('telemetry');
    } else if (c === 'queue' || c === 'todo' || c === 'tasks') {
      setQueueOpen(true);
      reply = `[Sophia Vance - COO] OS Work Queue opened. Showing active sequence: Step 4 In Progress, Step 5 Queued, 1 Ratification Waiting.`;
    } else if (c === 'workforce' || c === 'agents') {
      reply = `[Sophia Vance - COO] Workforce Roster:
  SOPHIA   [COO]         ACTIVE (v1)   - ${focus.task}
  THORNE   [RESEARCH]    ACTIVE (v1)   - Synthesizing competitive benchmark memos
  MAYA     [PRODUCT]     DEFERRED (v1) - Governed standby outside v1 execution loop
  JULIAN   [FINANCE]     DEFERRED (v1) - Governed standby outside v1 execution loop
  ELENA    [GOVERNANCE]  PLANNED (v2+) - Planned target-state architecture
  MARCUS   [SYSTEMS]     PLANNED (v2+) - Planned target-state architecture`;
      setRosterExpanded(true);
    } else if (c.startsWith('directive ') || c.startsWith('task ') || c.startsWith('run ')) {
      const dir = text.replace(/^(directive|task|run)\s+/i, '').trim();
      perform('directive');
      reply = `[Sophia Vance - COO] Directive received: "${dir}". Decomposing into 9-Step Agent Work Protocol in safe mock sandbox. Active work surface surfaced.`;
      setActiveContext('work');
    } else if (c === 'verify' || c === 'diagnostic' || c === 'audit') {
      perform('diagnostic');
      reply = `[Constitutional Verifier] Deterministic audit passed. 0 invariant breaches detected. Gross margin floor ≥ 80.0% verified. Single-use payload binding active.`;
      setActiveContext('audit');
    } else if (c === 'approve' || c === 'ratify') {
      if (approvalPending) {
        setApprovalPending(false);
        addEvent('FOUNDER', 'Founder ratified Executive Market Memo · cryptographic signature committed [Sandbox]', '#d8b477');
        notify('Decision ratified by Founder. Invariant-checked artifacts committed to audit log.');
        reply = `[Sophia Vance - COO] Directive ratified and signed. Artifacts committed to durable audit stream. Returning to calm Core state.`;
        setActiveContext('idle');
      } else {
        reply = `[Sophia Vance - COO] No pending actions awaiting founder ratification. Core remains calm.`;
      }
    } else if (c === 'calm' || c === 'close' || c === 'dismiss') {
      setActiveContext('idle');
      setRosterExpanded(false);
      reply = `[Sophia Vance - COO] Returned to calm default Core environment.`;
    } else if (c === 'wake') {
      perform('wake');
      reply = `[Sophia Vance - COO] Verified active v1 workforce readiness. Deferred roles remain securely governed in standby.`;
    } else if (c === 'reset') {
      perform('reset');
      reply = `[SamJuniors Core] Front-facing perspective reset to nominal coordinates.`;
    } else if (c === 'pause' || c === 'resume') {
      setPaused(c === 'pause');
      reply = `[SamJuniors Core] Prototype environment ${c === 'pause' ? 'paused' : 'resumed'}.`;
    } else if (c.startsWith('ping ')) {
      const name = c.split(' ')[1]?.toUpperCase();
      const a = agents.find(ag => ag.name === name);
      if (a) {
        setBurst(Date.now());
        addEvent(name, 'Specialist ping acknowledged · 12 ms', a.color);
        reply = `[${a.fullName}] Ping acknowledged from Founder · 12 ms latency · Status: ${a.isV1Active ? 'Active (v1)' : a.tier}.`;
      } else {
        reply = `[Sophia Vance - COO] Unknown specialist "${name}". Available specialists: SOPHIA, THORNE, MAYA, JULIAN, ELENA, MARCUS.`;
      }
    } else if (c === 'open settings' || c === 'open about') {
      setModal(c.slice(5));
      reply = `[SamJuniors Core] ${c.slice(5).toUpperCase()} panel opened.`;
    } else if (c === 'clear') {
      setMessages([]);
      return;
    } else {
      setBurst(Date.now());
      reply = `[Sophia Vance - COO] Acknowledged: "${text}". The Core intelligence mesh is active in safe mock sandbox. I have logged this inquiry into our working protocol context.`;
    }

    setMessages(m => [...m, { who: 'you', text }, { who: 'sophia', text: reply }].slice(-100));
  };

  const openAgent = (name: string) => {
    setSelected(name);
    setModal(null);
  };
  const closeOverlay = () => {
    setModal(null);
    setSelected(null);
  };

  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const controls = modalRef.current?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]');
    if (!controls?.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const renderQueueCard = (task: QueueTask) => {
    const isExpanded = expandedTaskId === task.id;
    return (
      <article
        key={task.id}
        className={'queue-card ' + (isExpanded ? 'expanded' : '')}
        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
      >
        <div className="queue-card-top">
          <span className={'queue-status-tag ' + task.statusClass}>
            {task.status}
          </span>
          <button
            type="button"
            className="queue-owner-pill"
            style={{ color: task.ownerColor }}
            onClick={(e) => {
              e.stopPropagation();
              if (task.ownerCode !== 'CORE') {
                openAgent(task.ownerCode);
              }
            }}
            title={task.ownerCode !== 'CORE' ? `Inspect ${task.ownerName} context` : 'SamJuniors Core OS layer'}
          >
            <span className="queue-owner-dot" style={{ background: task.ownerColor }} />
            {task.ownerName}
          </button>
        </div>

        <h3 className="queue-task-title">{task.title}</h3>

        {task.stepProgress && task.percent !== undefined && (
          <div className="queue-progress-row">
            <span>{task.stepProgress}</span>
            <span>{task.percent}%</span>
          </div>
        )}
        {task.percent !== undefined && (
          <div className="queue-progress-bar">
            <div
              className="queue-progress-fill"
              style={{ width: `${task.percent}%`, background: task.ownerColor }}
            />
          </div>
        )}

        <div className="queue-step-flow">
          {task.currentStep && (
            <div className="queue-step-item">
              <span className="queue-step-badge">NOW</span>
              <p className="queue-step-text">{task.currentStep}</p>
            </div>
          )}
          {task.nextStep && (
            <div className="queue-step-item">
              <span className="queue-step-badge">NEXT</span>
              <p className="queue-step-text">{task.nextStep}</p>
            </div>
          )}
          {task.thenStep && (
            <div className="queue-step-item">
              <span className="queue-step-badge">THEN</span>
              <p className="queue-step-text">{task.thenStep}</p>
            </div>
          )}
          {task.waitingReason && (
            <div className="queue-step-item">
              <span className="queue-step-badge" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)' }}>WAITING</span>
              <p className="queue-step-text" style={{ color: '#fbbf24' }}>{task.waitingReason}</p>
            </div>
          )}
          {task.completedAt && (
            <div className="queue-step-item">
              <span className="queue-step-badge" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.1)' }}>DONE</span>
              <p className="queue-step-text" style={{ color: '#8aa0b4' }}>{task.completedAt} · {task.provenanceNote}</p>
            </div>
          )}
        </div>

        {task.category === 'waiting' && (
          <div style={{ marginTop: '10px' }} onClick={e => e.stopPropagation()}>
            <button
              className="button amber-button"
              style={{ width: '100%', justifyContent: 'center', fontSize: '11px', padding: '7px 12px' }}
              onClick={() => {
                setQueueOpen(false);
                setActiveContext('approval');
              }}
            >
              <Icon name="shield" size={13} />
              Open Founder Decision Gate
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="queue-expanded-details">
            <p>{task.details}</p>
            {task.invariantStatus && (
              <div className="queue-detail-row">
                <span>INVARIANT INTEGRITY</span>
                <strong>{task.invariantStatus}</strong>
              </div>
            )}
            <div className="queue-detail-row">
              <span>SPECIALIST ROLE</span>
              <strong>{task.ownerRole}</strong>
            </div>
            <div className="queue-detail-row">
              <span>PROTOTYPE BOUNDARY</span>
              <strong style={{ color: '#d8b477' }}>Local Safe Mock Sandbox</strong>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="app-shell" data-theme={settings.theme || 'solar'}>
      <a href="#main-controls" className="skip-link">
        Skip to controls
      </a>

      {/* TOP BAR */}
      <header className="topbar">
        <a className="brand" href="#" aria-label="SamJuniors Core overview" onClick={() => setTab('Overview')}>
          <span className="brand-mark">
            <Icon name="core" size={25} />
          </span>
          <span>
            SAMJUNIORS <b>OS</b>
          </span>
          <span className="version">v1 Core</span>
        </a>
        <div className="top-center">
          <span className="tiny-cross">+</span> SAMJUNIORS CORE · GOVERNED INTELLIGENCE LAYER{' '}
          <span className="tiny-cross">+</span>
        </div>
        <div className="header-right">
          <span className="local-status">
            <i />PROTOTYPE SANDBOX
          </span>
          <span className="header-separator" />
          <button className="quiet-icon" title="About SamJuniors Core" onClick={() => setModal('about')}>
            <Icon name="info" />
          </button>
          <button className="avatar" onClick={() => setModal('settings')} title="System preferences">
            SJ
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main id="main-controls">
        <section className="workspace-header">
          <div className="workspace-title">
            <div className="breadcrumb">
              WORKSPACE <Icon name="chevron" size={11} /> COMMAND CENTER
            </div>
            <h1>
              SamJuniors Core{' '}
              <span className="healthy">
                <i />
                {paused ? 'Prototype Paused' : 'Prototype · Invariants Nominal'}
              </span>
            </h1>
          </div>
          <div className="workspace-actions">
            <span className="session">
              <i /> FOUNDER SESSION
            </span>
            <button className="button" onClick={() => perform('diagnostic')}>
              <Icon name="shield" size={14} />
              Verify invariants
            </button>
            <button className="button amber-button" onClick={() => perform('directive')}>
              <Icon name="bolt" size={15} />
              Issue directive
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>

        {/* WORKSPACE TABS */}
        <div className="workspace-tabs">
          <nav aria-label="Workspace views">
            {(['Overview', 'Workforce monitor', 'Audit stream'] as const).map((name, i) => (
              <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
                <Icon name={(['grid', 'activity', 'list'] as IconName[])[i]} size={14} />
                {name}
                {i === 1 && <span className="tab-count">2 Active / 4 Standby</span>}
                {i === 2 && <span className="event-dot" />}
              </button>
            ))}
          </nav>
          <div className="live-label">
            <i className={paused ? 'paused' : ''} />
            {paused ? 'PROTOTYPE PAUSED' : 'CALM INTELLIGENCE CORE'}
            <span>•</span>SAFE MOCK SANDBOX
          </div>
        </div>

        {tab === 'Overview' ? (
          <>
            <div
              className={
                'overview-grid ' +
                (activeContext === 'idle'
                  ? 'calm-idle'
                  : activeContext === 'telemetry' || activeContext === 'audit'
                  ? 'with-panel panel-right'
                  : 'with-panel')
              }
            >
              {/* 1. LEFT COLUMN: CONTEXTUAL ACTIVE WORK PROTOCOL */}
              {activeContext === 'work' && (
                <aside className="left-column">
                  <div className="contextual-header">
                    <span>
                      <Icon name="list" size={13} /> ACTIVE DIRECTIVE ORCHESTRATION
                    </span>
                    <button
                      className="return-calm-btn"
                      onClick={() => setActiveContext('idle')}
                      title="Return to Calm (Esc)"
                    >
                      <Icon name="close" size={12} /> Return to Calm (Esc)
                    </button>
                  </div>

                  <section className="panel focus-panel">
                    <div className="panel-title">
                      <span>
                        <i className="amber-dot" />CURRENT FOCUS · SOPHIA
                      </span>
                      <span className="muted">COO</span>
                    </div>
                    <span className="task-tag">DIRECTIVE ORCHESTRATION</span>
                    <h2>{focus.task}</h2>
                    <p className="focus-description">
                      Sophia Vance coordinates multi-agent execution across research and specifications while strictly enforcing constitutional safety bounds.
                    </p>
                    <div className="assigned">
                      <span className="agent-mini" style={{ color: focus.color }}>
                        <Icon name="core" size={15} />
                      </span>
                      <strong>{focus.name}</strong>
                      <span className="working-status">
                        {paused ? 'Paused' : 'Active v1'}
                        <i />
                      </span>
                    </div>
                    <div className="progress-caption">
                      <span>Step 4: Plan · 9-Step Protocol</span>
                      <strong>
                        {Math.round(focus.progress)}
                        <small>%</small>
                      </strong>
                    </div>
                    <div className="progress-track">
                      <i style={{ width: focus.progress + '%' }} />
                    </div>
                    <div className="focus-bottom">
                      <Icon name="message" size={12} />
                      <span>FOUNDER INTERFACE</span>
                      <button
                        title="Direct Sophia in Console"
                        onClick={() => setModal('console')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--amber)' }}
                      >
                        Direct Sophia <Icon name="arrow" size={13} />
                      </button>
                    </div>
                  </section>

                  <section className="panel activity-panel">
                    <div className="panel-title">
                      <span>RECENT AUDIT ACTIVITY</span>
                      <span className="live-pill">SAFE SANDBOX</span>
                    </div>
                    <div className="activity-list">
                      {events.slice(0, 4).map((e, i) => (
                        <div className="activity-item" key={e.name + e.time.getTime() + i}>
                          <span className="activity-marker" style={{ background: e.color }} />
                          <div>
                            <div className="activity-meta">
                              <strong style={{ color: e.color }}>{e.name}</strong>
                              <time>
                                {Math.max(1, Math.floor((now.getTime() - e.time.getTime()) / 1000)) < 60
                                  ? `${Math.max(1, Math.floor((now.getTime() - e.time.getTime()) / 1000))}s ago`
                                  : `${Math.floor((now.getTime() - e.time.getTime()) / 60000)}m ago`}
                              </time>
                            </div>
                            <p>{e.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="panel-link" onClick={() => setTab('Audit stream')}>
                      View audit stream
                      <Icon name="arrow" size={13} />
                    </button>
                  </section>
                </aside>
              )}

              {/* 2. LEFT COLUMN: CONTEXTUAL FOUNDER DECISION GATE */}
              {activeContext === 'approval' && (
                <aside className="left-column">
                  <section className="panel">
                    <div className="contextual-header">
                      <span>
                        <Icon name="shield" size={13} /> FOUNDER DECISION GATE
                      </span>
                      <button
                        className="return-calm-btn"
                        onClick={() => setActiveContext('idle')}
                        title="Return to Calm (Esc)"
                      >
                        <Icon name="close" size={12} /> Return to Calm (Esc)
                      </button>
                    </div>
                    <div className="decision-surface">
                      <span className="decision-badge">
                        <Icon name="shield" size={11} /> RATIFICATION REQUIRED
                      </span>
                      <h3>Executive Market Intelligence Memo & Sandbox Resource Release</h3>
                      <p style={{ fontSize: '10px', color: '#8898a6', margin: 0, lineHeight: 1.6 }}>
                        Sophia Vance (COO) and Dr. Aris Thorne (Research) finalized competitive benchmark findings. Consequential side-effects require human founder ratification per Phase 3.6 Invariant rules.
                      </p>
                      <div className="decision-detail-box">
                        <div className="decision-detail-row">
                          <span>MANDATE INITIATOR</span>
                          <strong>Sophia Vance (COO)</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>LEAD RESEARCHER</span>
                          <strong>Dr. Aris Thorne (Research)</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>CONSTITUTIONAL INVARIANT</span>
                          <strong style={{ color: '#91bca2' }}>Gross Margin ≥ 80.0% Verified</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>ENVIRONMENT</span>
                          <strong>Safe Mock Sandbox (Local)</strong>
                        </div>
                      </div>
                      <div className="decision-actions">
                        <button
                          className="button amber-button"
                          onClick={() => {
                            setApprovalPending(false);
                            addEvent('FOUNDER', 'Founder ratified Executive Market Memo · cryptographic signature verified [Sandbox]', '#d8b477');
                            notify('Directive ratified by Founder. Invariant-checked artifacts recorded to audit log.');
                            setActiveContext('idle');
                          }}
                        >
                          <Icon name="check" size={14} />
                          Ratify & Sign Artifact
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            setApprovalPending(false);
                            addEvent('FOUNDER', 'Founder rejected proposal · fail-closed state preserved [Sandbox]', '#f87171');
                            notify('Directive proposal rejected by Founder. Safe fail-closed state preserved.');
                            setActiveContext('idle');
                          }}
                        >
                          <Icon name="close" size={14} />
                          Reject (Fail-Closed)
                        </button>
                      </div>
                    </div>
                  </section>
                </aside>
              )}

              {/* 3. CENTER COLUMN: SPATIAL SAMJUNIORS CORE + SOPHIA CONVERSATIONAL BAR */}
              <div className="calm-canvas-wrap">
                {/* Edge affordances in calm idle state */}
                {activeContext === 'idle' && (
                  <div className="edge-affordances">
                    <button
                      className="edge-pill edge-pill-left"
                      onClick={() => setActiveContext('work')}
                      title="Open Active Directive Protocol"
                    >
                      <Icon name="list" size={11} />
                      <span>ACTIVE PROTOCOL · STEP 4</span>
                      <Icon name="arrow" size={10} />
                    </button>
                    <button
                      className="edge-pill edge-pill-right"
                      onClick={() => setActiveContext('telemetry')}
                      title="Open Health & Telemetry"
                    >
                      <Icon name="activity" size={11} />
                      <span>SYSTEM & INVARIANTS</span>
                      <Icon name="arrow" size={10} />
                    </button>
                  </div>
                )}

                <section className="visualization" aria-label="SamJuniors Core spatial visualization" style={{ flex: 1, minHeight: '340px' }}>
                  <div className="scene-top">
                    <span>
                      <i />SAMJUNIORS CORE <b> / </b> INTELLIGENCE LAYER
                    </span>
                    <div>
                      <button className="quiet-icon" title="Reset front-facing view" onClick={() => perform('reset')}>
                        <Icon name="reset" size={14} />
                      </button>
                      <button className="quiet-icon" title="Expand visualization" onClick={() => setModal('scene')}>
                        <Icon name="expand" size={14} />
                      </button>
                    </div>
                  </div>

                  <Scene
                    paused={paused}
                    reduced={settings.reduced}
                    quality={settings.quality}
                    burst={burst}
                    reset={reset}
                    theme={settings.theme}
                  />

                  {settings.labels && (
                    <div className="agent-labels">
                      {agents.map(a => (
                        <button
                          className="orbital-agent"
                          key={a.name}
                          style={
                            {
                              left: a.x + '%',
                              top: a.y + '%',
                              '--agent-color': a.isV1Active ? a.color : '#657482',
                              opacity: a.isV1Active ? 1 : 0.65
                            } as React.CSSProperties
                          }
                          onClick={() => openAgent(a.name)}
                        >
                          <span className="orbit-node">
                            <span />
                          </span>
                          <strong>{a.name}</strong>
                          <small>
                            {a.short} · {a.isV1Active ? 'v1' : 'Standby'}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="core-caption">
                    <span className="core-title">CORE INTELLIGENCE LAYER · SOPHIA INTERFACE</span>
                    <span>GOVERNED · VERIFIED · FOUNDER-GATED</span>
                  </div>

                  <div className="scene-bottom">
                    <span>
                      <i className="amber-dot" />6 SPECIALISTS <b>·</b> GOVERNED PROTOCOL MESH
                    </span>
                    <span>DRAG TO ORBIT <b>·</b> SCROLL TO ZOOM</span>
                  </div>
                </section>

                {/* SOPHIA CONVERSATIONAL BAR */}
                <section className="sophia-conversational-bar" aria-label="Sophia Vance founder interface">
                  <div className="sophia-bar-header">
                    <div className="sophia-identity">
                      <span style={{ display: 'grid', placeItems: 'center' }}>
                        <Icon name="core" size={16} />
                      </span>
                      <div>
                        <strong>SOPHIA VANCE</strong>
                        <span>CHIEF OPERATING OFFICER · FOUNDER-FACING INTERFACE</span>
                      </div>
                    </div>
                    <div className="sophia-bar-meta">
                      <span className="sophia-meta-pill">
                        <i className="amber-dot" /> ACTIVE V1 ORCHESTRATION
                      </span>
                      <span className="sophia-meta-pill">
                        <Icon name="shield" size={10} /> INVARIANTS SATISFIED
                      </span>
                    </div>
                  </div>

                  {/* SOPHIA QUICK INPUT */}
                  <form className="sophia-form" onSubmit={submit}>
                    <label htmlFor="sophia-quick-cmd" className="sophia-prompt-prefix">
                      founder ›
                    </label>
                    <input
                      id="sophia-quick-cmd"
                      ref={sophiaInputRef}
                      value={command}
                      onChange={e => setCommand(e.target.value)}
                      placeholder="Message Sophia, issue directive, or type question... (press /)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button className="button amber-button" type="submit" style={{ padding: '5px 10px', fontSize: '9px' }}>
                      Send <Icon name="arrow" size={12} />
                    </button>
                  </form>

                  <div className="sophia-action-chips">
                    <button
                      type="button"
                      className="calm-chip amber"
                      onClick={() => perform('directive')}
                      title="Dispatch directive and reveal active work protocol"
                    >
                      <Icon name="bolt" size={11} /> Issue Directive
                    </button>
                    <button
                      type="button"
                      className="calm-chip"
                      onClick={() => setQueueOpen(true)}
                      title="Open founder OS work queue (Q)"
                    >
                      <Icon name="list" size={11} /> Work Queue (4)
                    </button>
                    <button
                      type="button"
                      className={'calm-chip ' + (approvalPending ? 'urgent' : '')}
                      onClick={() => setActiveContext('approval')}
                      title="Open founder decision gate"
                    >
                      <Icon name="shield" size={11} />
                      {approvalPending ? 'Founder Approval Gate (1)' : 'Approval Gate (Nominal)'}
                    </button>
                    <button
                      type="button"
                      className="calm-chip"
                      onClick={() => perform('diagnostic')}
                      title="Verify constitutional safety bounds"
                    >
                      <Icon name="shield" size={11} /> Invariant Audit
                    </button>
                    <button
                      type="button"
                      className="calm-chip"
                      onClick={() => setActiveContext('telemetry')}
                      title="View operational telemetry & health"
                    >
                      <Icon name="activity" size={11} /> Telemetry & Health
                    </button>
                    <button
                      type="button"
                      className="calm-chip"
                      onClick={() => setRosterExpanded(r => !r)}
                      title="Toggle workforce roster"
                    >
                      <Icon name="nodes" size={11} /> Specialists (6)
                    </button>
                  </div>
                </section>
              </div>

              {/* 4. RIGHT COLUMN: CONTEXTUAL DETERMINISTIC INVARIANT AUDIT */}
              {activeContext === 'audit' && (
                <aside className="right-column">
                  <section className="panel">
                    <div className="contextual-header">
                      <span>
                        <Icon name="shield" size={13} /> CONSTITUTIONAL AUDIT
                      </span>
                      <button
                        className="return-calm-btn"
                        onClick={() => setActiveContext('idle')}
                        title="Return to Calm (Esc)"
                      >
                        <Icon name="close" size={12} /> Return to Calm (Esc)
                      </button>
                    </div>
                    <div className="decision-surface">
                      <div className="decision-detail-box">
                        <div className="decision-detail-row">
                          <span>GROSS MARGIN FLOOR</span>
                          <strong style={{ color: '#91bca2' }}>≥ 80.0% PASS</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>SINGLE-USE BINDING</span>
                          <strong style={{ color: '#91bca2' }}>ACTIVE</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>DATA EXFILTRATION GATE</span>
                          <strong style={{ color: '#91bca2' }}>0 BYPASSES</strong>
                        </div>
                        <div className="decision-detail-row">
                          <span>RUNTIME SANDBOX</span>
                          <strong style={{ color: '#91bca2' }}>SAFE MOCK ISOLATED</strong>
                        </div>
                      </div>
                      <p style={{ fontSize: '9px', color: '#7e8e9b', margin: 0, lineHeight: 1.6 }}>
                        Safety invariants evaluate deterministically before and after every workflow event. Breaches automatically halt execution in safe fail-closed state.
                      </p>
                      <button className="button amber-button" onClick={() => perform('diagnostic')}>
                        <Icon name="shield" size={13} />
                        Re-verify Invariant Safety
                      </button>
                    </div>
                  </section>
                </aside>
              )}

              {/* 5. RIGHT COLUMN: CONTEXTUAL OPERATIONAL TELEMETRY & HEALTH */}
              {activeContext === 'telemetry' && (
                <aside className="right-column">
                  <div className="contextual-header">
                    <span>
                      <Icon name="activity" size={13} /> OPERATIONAL TELEMETRY
                    </span>
                    <button
                      className="return-calm-btn"
                      onClick={() => setActiveContext('idle')}
                      title="Return to Calm (Esc)"
                    >
                      <Icon name="close" size={12} /> Return to Calm (Esc)
                    </button>
                  </div>

                  <section className="panel telemetry-panel">
                    <div className="panel-title">
                      <span>CORE & WORKFORCE TELEMETRY</span>
                      <Icon name="activity" size={14} />
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        <Icon name="signal" size={14} />Epistemic signals
                        <span className="metric-change" style={{ color: '#7e909d' }}>Not connected</span>
                      </div>
                      <div className="metric-value" style={{ color: '#8897a4' }}>
                        —
                      </div>
                      <span className="metric-note">Authoritative claims require Phase 3.3 Company Brain integration</span>
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        <Icon name="memory" size={14} />Governed deliverables
                        <span className="metric-change" style={{ color: '#7e909d' }}>Safe Mock</span>
                      </div>
                      <div className="metric-value" style={{ color: '#8897a4' }}>
                        —
                      </div>
                      <span className="metric-note">Prototype artifacts only · 0 authoritative store records</span>
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        <Icon name="nodes" size={14} />Workforce roster
                      </div>
                      <div className="metric-value">
                        {activeV1Count}
                        <span className="metric-denominator">/ 2</span>
                        <span className="active-tag">2 V1 ACTIVE · 4 STANDBY</span>
                      </div>
                      <div className="capacity-bars">
                        {agents.map(a => (
                          <i
                            key={a.name}
                            style={{
                              background: a.isV1Active ? a.color : '#1c242c',
                              opacity: a.isV1Active ? 1 : 0.4
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="metric coherence-metric">
                      <div className="metric-label">
                        <Icon name="shield" size={14} />Invariant compliance
                        <i className="green-dot" />
                      </div>
                      <div className="metric-value" style={{ fontSize: '22px' }}>
                        Enforced
                      </div>
                      <div className="coherence-line">
                        <i />
                      </div>
                      <span className="metric-note">
                        <span className="green-text">Deterministic floor</span> · safe mock sandbox active
                      </span>
                    </div>
                  </section>

                  <section className="panel system-panel">
                    <div className="panel-title">
                      <span>SYSTEM HEALTH & BOUNDARIES</span>
                      <i className="green-dot" />
                    </div>
                    <div className="health-row">
                      <span>Execution runtime</span>
                      <strong>Safe Mock Sandbox</strong>
                    </div>
                    <div className="health-row">
                      <span>Session uptime</span>
                      <strong>
                        {String(Math.floor(seconds / 3600)).padStart(2, '0')}:
                        {String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:
                        {String(seconds % 60).padStart(2, '0')}
                      </strong>
                    </div>
                    <div className="health-row">
                      <span>Authority boundary</span>
                      <span className="local-tag">FOUNDER GATED</span>
                    </div>
                    <div className="health-row">
                      <span>Gross margin floor</span>
                      <strong>≥ 80.0% Enforced</strong>
                    </div>
                    <p>
                      <Icon name="shield" size={11} />Private by design. Safe mock sandboxing enforced. No production database connected.
                    </p>
                  </section>
                </aside>
              )}
            </div>

            {/* WORKFORCE ROSTER BOTTOM SECTION (Calm Strip or Expanded) */}
            {!rosterExpanded ? (
              <div className="roster-calm-strip">
                <span>
                  <i className="green-dot" />
                  AI WORKFORCE <b>06</b> · 2 ACTIVE (V1) · 4 GOVERNED STANDBY
                </span>
                <button className="roster-calm-toggle" onClick={() => setRosterExpanded(true)}>
                  Show Specialist Roster ▾
                </button>
              </div>
            ) : (
              <section className="roster-section">
                <div className="roster-heading">
                  <span>
                    AI WORKFORCE <b>06</b>
                  </span>
                  <span>
                    <i className="green-dot" />2 ACTIVE (V1) · 4 GOVERNED STANDBY
                  </span>
                  <button onClick={() => setRosterExpanded(false)}>
                    Collapse Roster ▴
                  </button>
                  <button onClick={() => perform('wake')}>
                    Verify v1 workforce
                    <Icon name="bolt" size={12} />
                  </button>
                </div>
                <div className="roster-cards">
                  {agents.map(a => (
                    <button
                      key={a.name}
                      className="roster-card"
                      onClick={() => openAgent(a.name)}
                      style={
                        {
                          '--agent-color': a.isV1Active ? a.color : '#566675',
                          opacity: a.isV1Active ? 1 : 0.72
                        } as React.CSSProperties
                      }
                    >
                      <span className="roster-icon">
                        <Icon name="core" size={23} />
                      </span>
                      <div>
                        <strong>
                          {a.name}
                          <i className={a.isV1Active ? '' : 'standby'} />
                        </strong>
                        <span>
                          {a.short} · {a.isV1Active ? 'v1 Active' : 'Standby'}
                        </span>
                      </div>
                      <div className="roster-status">
                        {a.isV1Active ? (paused ? 'Paused' : 'Active') : 'Standby'}
                        <span>{a.isV1Active ? 'Prototype' : 'Governed'}</span>
                      </div>
                      <span className="roster-progress" style={{ width: (a.isV1Active ? a.progress : 0) + '%' }} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="data-view panel">
            <div className="data-view-header">
              <div>
                <div className="eyebrow">
                  {tab === 'Workforce monitor'
                    ? 'SIX SPECIALISTS · STRICT V1 & TARGET-STATE SEPARATION'
                    : 'DURABLE AUDIT TRAIL · CONSTITUTIONAL ACTIONS'}
                </div>
                <h2>{tab}</h2>
              </div>
              {tab === 'Workforce monitor' ? (
                <button className="button amber-button" onClick={() => perform('wake')}>
                  <Icon name="bolt" size={14} />Verify v1 workforce
                </button>
              ) : (
                <label className="search-box">
                  <Icon name="search" size={15} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter audit events…"
                    aria-label="Filter audit events"
                  />
                </label>
              )}
            </div>

            {tab === 'Workforce monitor' ? (
              <div className="monitor-grid">
                {agents.map(a => (
                  <button
                    className="monitor-agent"
                    key={a.name}
                    onClick={() => openAgent(a.name)}
                    style={{ opacity: a.isV1Active ? 1 : 0.8 }}
                  >
                    <span style={{ color: a.isV1Active ? a.color : '#7e8c99' }}>
                      <Icon name="core" size={28} />
                    </span>
                    <div className="monitor-agent-title">
                      <h3 style={{ color: a.isV1Active ? a.color : '#b0bcc8' }}>{a.fullName}</h3>
                      <span
                        className="status-badge"
                        style={{
                          borderColor: a.isV1Active ? '#2e4c3a' : '#2b3642',
                          color: a.isV1Active ? '#9db4a5' : '#738392'
                        }}
                      >
                        {a.tier}
                      </span>
                    </div>
                    <p>{a.role}</p>
                    <div className="monitor-task">
                      {a.isV1Active ? a.task : `${a.short} architecture preserved in governed standby.`}
                    </div>
                    <div className="progress-track">
                      <i style={{ width: (a.isV1Active ? a.progress : 0) + '%', background: a.color }} />
                    </div>
                    <div className="monitor-footer">
                      <span>{a.isV1Active ? 'Prototype mock sandbox' : 'Governed standby'}</span>
                      <span>
                        {a.isV1Active ? `${Math.round(a.progress)}%` : 'Standby'}
                        <Icon name="arrow" size={13} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="event-table">
                <div className="event-table-heading">
                  <span>TIME</span>
                  <span>SOURCE</span>
                  <span>EVENT / ACTION</span>
                  <span>VERIFICATION</span>
                </div>
                {events
                  .filter(e => (e.name + ' ' + e.text).toLowerCase().includes(query.toLowerCase()))
                  .map((e, i) => (
                    <div className="event-table-row" key={i}>
                      <time>{e.time.toLocaleTimeString('en-GB')}</time>
                      <strong style={{ color: e.color }}>{e.name}</strong>
                      <span>{e.text}</span>
                      <span className="green-text">
                        Verified <Icon name="check" size={12} />
                      </span>
                    </div>
                  ))}
                {!events.some(e => (e.name + ' ' + e.text).toLowerCase().includes(query.toLowerCase())) && (
                  <p className="empty-state">No audit records match “{query}”.</p>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* BOTTOM BAR / DOCK / LAUNCHER */}
      <footer className="bottom-bar">
        <div className="launcher-wrap">
          <button
            className={'launcher-button ' + (launcher ? 'selected' : '')}
            aria-expanded={launcher}
            onClick={() => setLauncher(!launcher)}
          >
            <Icon name="core" size={18} />
            <span>SAMJUNIORS</span>
            <span className="launcher-dots">⠿</span>
          </button>
          {launcher && (
            <div className="launcher-menu panel">
              <div className="eyebrow">COMMAND CENTER NAVIGATION</div>
              {(
                [
                  ['console', 'Sophia / Core Console', 'console'],
                  ['queue', 'OS Work Queue & Tasks', 'list'],
                  ['monitor', 'Workforce monitor', 'activity'],
                  ['settings', 'System preferences', 'settings'],
                  ['about', 'About SamJuniors Core', 'info']
                ] as [string, string, IconName][]
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => {
                    setLauncher(false);
                    if (id === 'queue') setQueueOpen(true);
                    else if (id === 'monitor') setTab('Workforce monitor');
                    else setModal(id);
                  }}
                >
                  <Icon name={icon} size={16} />
                  {label}
                  <Icon name="chevron" size={12} />
                </button>
              ))}
            </div>
          )}
          <span className="footer-version">SAMJUNIORS OS · CORE INTELLIGENCE LAYER</span>
        </div>

        <div className="dock">
          {(
            [
              ['console', 'Direct Sophia (/ console)', 'console'],
              ['queue', 'Work Queue (Q)', 'list'],
              ['monitor', 'Workforce monitor', 'activity'],
              ['settings', 'Settings', 'settings']
            ] as [string, string, IconName][]
          ).map(([id, label, icon]) => (
            <button
              key={id}
              title={label + (id === 'console' ? ' (/)' : id === 'queue' ? ' (Q)' : '')}
              className={
                id === 'queue'
                  ? queueOpen
                    ? 'selected'
                    : ''
                  : modal === id || (id === 'monitor' && tab === 'Workforce monitor')
                  ? 'selected'
                  : ''
              }
              onClick={() => {
                if (id === 'queue') {
                  setQueueOpen(q => !q);
                } else if (id === 'monitor') {
                  setTab(tab === 'Workforce monitor' ? 'Overview' : 'Workforce monitor');
                } else {
                  setModal(id);
                }
              }}
            >
              <Icon name={icon} size={19} />
            </button>
          ))}
          <span className="dock-divider" />
          <button
            title={paused ? 'Resume simulation' : 'Pause simulation (Space)'}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            <Icon name={paused ? 'play' : 'pause'} size={18} />
          </button>
          <button title="Verify constitutional invariants" onClick={() => perform('diagnostic')}>
            <Icon name="shield" size={18} />
          </button>
          <span className="dock-divider" />
          <button title="About SamJuniors Core" onClick={() => setModal('about')}>
            <Icon name="info" size={18} />
          </button>
        </div>

        <div className="footer-right">
          <span className="console-shortcut">
            <kbd>/</kbd> DIRECT SOPHIA
          </span>
          <div className="clock">
            <strong>{now.toLocaleTimeString('en-GB')}</strong>
            <span>
              {now
                .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })
                .toUpperCase()}
            </span>
          </div>
        </div>
      </footer>

      {/* TOAST NOTIFICATION */}
      {notice && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={15} />
          </span>
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* MODALS */}
      {(modal || agent) && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeOverlay();
          }}
        >
          <div
            ref={modalRef}
            className={
              'modal panel ' +
              (modal === 'scene' ? 'scene-modal' : '') +
              (modal === 'console' ? ' console-modal' : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-heading"
            onKeyDown={trapFocus}
          >
            <header className="modal-header">
              <span>
                <Icon
                  name={
                    agent
                      ? 'core'
                      : modal === 'console'
                      ? 'console'
                      : modal === 'settings'
                      ? 'settings'
                      : modal === 'scene'
                      ? 'core'
                      : 'info'
                  }
                  size={16}
                />
                <h2 id="modal-heading">
                  {agent
                    ? `${agent.fullName.toUpperCase()} / SPECIALIST DETAILS`
                    : modal === 'console'
                    ? 'SOPHIA VANCE & SAMJUNIORS CORE / CONSOLE'
                    : modal === 'settings'
                    ? 'SYSTEM / PREFERENCES'
                    : modal === 'scene'
                    ? 'SAMJUNIORS CORE / EXPANDED VIEW'
                    : 'ABOUT / SAMJUNIORS CORE'}
                </h2>
              </span>
              <button className="quiet-icon" aria-label="Close dialog" onClick={closeOverlay}>
                <Icon name="close" size={19} />
              </button>
            </header>

            {/* SPECIALIST DETAIL MODAL */}
            {agent ? (
              <div className="modal-content agent-detail">
                <span className="detail-emblem" style={{ color: agent.color }}>
                  <Icon name="core" size={42} />
                </span>
                <div className="eyebrow">
                  AI SPECIALIST · {agent.clearance} · {agent.tier.toUpperCase()}
                </div>
                <h3 style={{ color: agent.isV1Active ? agent.color : '#cbd6df' }}>{agent.fullName}</h3>
                <p>
                  {agent.role} &mdash; {agent.department}
                </p>
                <div className="detail-status">
                  <i style={{ background: agent.isV1Active ? agent.color : '#566675' }} />
                  {agent.isV1Active
                    ? paused
                      ? 'PAUSED'
                      : 'ACTIVE V1 OPERATIONAL'
                    : 'GOVERNED IN STANDBY'}
                  <span>
                    {agent.name === 'SOPHIA'
                      ? 'Operational COO Interface to SamJuniors Core'
                      : agent.isV1Active
                      ? 'Lead Research Specialist (v1 active loop)'
                      : 'Deferred/Target-State Specialist'}
                  </span>
                </div>
                <div className="detail-stats">
                  <div>
                    <span>DELIVERABLES AUTHORED</span>
                    <strong>—</strong>
                    <small style={{ fontSize: '7.5px', color: '#6e7e8b' }}>Prototype mock sandbox</small>
                  </div>
                  <div>
                    <span>PROTOCOL PROGRESS</span>
                    <strong>{agent.isV1Active ? `${Math.round(agent.progress)}%` : 'Standby'}</strong>
                  </div>
                </div>
                <div className="eyebrow">
                  {agent.isV1Active ? 'CURRENT PROTOCOL MANDATE' : 'ARCHITECTURAL GOVERNANCE STATUS'}
                </div>
                <p className="agent-current-task">
                  {agent.isV1Active
                    ? agent.task
                    : `${agent.fullName}'s role is specified in the repository architecture, but intentionally deferred outside the v1 execution loop per PRODUCT.md.`}
                </p>
                <div className="progress-track">
                  <i
                    style={{
                      width: (agent.isV1Active ? agent.progress : 0) + '%',
                      background: agent.color
                    }}
                  />
                </div>
                <div className="detail-actions">
                  {agent.isV1Active ? (
                    <>
                      {agent.name === 'SOPHIA' ? (
                        <button
                          className="button amber-button"
                          onClick={() => {
                            closeOverlay();
                            setModal('console');
                          }}
                        >
                          <Icon name="message" size={13} />
                          Direct Sophia in Console
                        </button>
                      ) : (
                        <button
                          className="button amber-button"
                          onClick={() => {
                            perform('directive');
                            closeOverlay();
                          }}
                        >
                          <Icon name="bolt" size={13} />
                          Request research pass
                        </button>
                      )}
                      <button
                        className="button"
                        onClick={() => {
                          setBurst(Date.now());
                          addEvent(agent.name, 'Specialist ping acknowledged · 12 ms', agent.color);
                          notify(`${agent.fullName} acknowledged ping · 12 ms`);
                        }}
                      >
                        <Icon name="broadcast" size={14} />
                        Ping specialist
                      </button>
                    </>
                  ) : (
                    <button className="button" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                      <Icon name="shield" size={13} />
                      {agent.tier.includes('Deferred')
                        ? 'Architecture Deferred (v1)'
                        : 'Planned Target-State (v2+)'}
                    </button>
                  )}
                  <button className="button" onClick={() => perform('wake')}>
                    Verify v1 workforce
                  </button>
                </div>
                <p className="note">
                  {agent.isV1Active
                    ? 'Active v1 foundation specialist. Workloads and metrics in this prototype run in a local safe mock sandbox.'
                    : 'Target-state architecture. Kept strictly in governed standby to prevent simulated execution from implying false operational capability.'}
                </p>
              </div>
            ) : modal === 'console' ? (
              <>
                <div className="console-banner">
                  <i className="green-dot" />
                  Sophia Vance (COO) operational interface attached
                  <span>SAFE MOCK SANDBOX</span>
                </div>
                <div className="console-log" ref={logRef} role="log" aria-live="polite">
                  {messages.map((m, i) => (
                    <div className={'console-message ' + (m.who === 'you' ? 'you' : 'sophia')} key={i}>
                      <span>
                        {m.who === 'you' ? 'FOUNDER' : 'SOPHIA VANCE (COO)'} <b>›</b>
                      </span>
                      <p>{m.text}</p>
                    </div>
                  ))}
                </div>
                <form className="console-form" onSubmit={submit}>
                  <label htmlFor="command">founder ›</label>
                  <input
                    id="command"
                    ref={inputRef}
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    placeholder="Message Sophia, issue directive, or type help…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="button amber-button" type="submit">
                    Send
                    <Icon name="arrow" size={14} />
                  </button>
                </form>
              </>
            ) : modal === 'settings' ? (
              <div className="modal-content">
                <div className="eyebrow">PREFERENCES & CALMNESS CONTROLS</div>
                <h3 className="modal-big-title">A quieter kind of control.</h3>
                {(['reduced', 'labels'] as const).map(key => (
                  <div className="setting-row" key={key}>
                    <label htmlFor={'setting-' + key}>
                      {key === 'reduced' ? 'Reduced motion' : 'Specialist orbital labels'}
                      <small>
                        {key === 'reduced'
                          ? 'Keep the central particle knot static while tasks continue.'
                          : 'Show specialist names and badges around the Core.'}
                      </small>
                    </label>
                    <button
                      id={'setting-' + key}
                      className={'switch ' + (settings[key] ? 'on' : '')}
                      role="switch"
                      aria-checked={settings[key]}
                      onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                    >
                      <i />
                    </button>
                  </div>
                ))}
                <div className="setting-row">
                  <label htmlFor="theme">
                    Interface Theme
                    <small>Switch between default warm amber (Solar) and deep cyan/space (Luna).</small>
                  </label>
                  <select
                    id="theme"
                    value={settings.theme || 'solar'}
                    onChange={e => setSettings(s => ({ ...s, theme: e.target.value as 'solar' | 'luna' }))}
                  >
                    <option value="solar">Dark Solar (Default Warm Amber)</option>
                    <option value="luna">Dark Luna (Astra Cyan & Deep Space)</option>
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="quality">
                    Rendering quality
                    <small>Lower quality reduces particle count to 5,500.</small>
                  </label>
                  <select
                    id="quality"
                    value={settings.quality}
                    onChange={e => setSettings(s => ({ ...s, quality: e.target.value }))}
                  >
                    <option value="high">High (13,000 particles)</option>
                    <option value="low">Low (5,500 particles)</option>
                  </select>
                </div>
                <div className="detail-actions">
                  <button className="button amber-button" onClick={() => perform('diagnostic')}>
                    Verify invariants
                  </button>
                  <button className="button" onClick={() => perform('reset')}>
                    Reset view
                  </button>
                </div>
                <p className="note">
                  Preferences are stored locally. SamJuniorsOS prototype runs strictly within local safe mock boundaries.
                </p>
              </div>
            ) : modal === 'scene' ? (
              <div className="expanded-scene">
                <Scene
                  paused={paused}
                  reduced={settings.reduced}
                  quality={settings.quality}
                  burst={burst}
                  reset={reset}
                  theme={settings.theme}
                />
                <span>FRONT-FACING SPATIAL CORE · DRAG TO ORBIT · SCROLL TO ZOOM</span>
              </div>
            ) : (
              <div className="modal-content about-content">
                <span className="detail-emblem">
                  <Icon name="core" size={42} />
                </span>
                <div className="eyebrow">CENTRAL INTELLIGENCE LAYER · SAMJUNIORS OS</div>
                <h3>
                  SAMJUNIORS CORE <span>v1 Prototype</span>
                </h3>
                <p>
                  SamJuniors Core is the internal operating system control and intelligence layer for SamJuniors. It maintains company memory, enforces constitutional safety invariants, and orchestrates specialist workflows.
                </p>
                <div className="about-notice">
                  <Icon name="info" size={19} />
                  <p>
                    <strong>Architectural distinction:</strong>
                    SamJuniors Core is the OS control layer. Sophia Vance (COO) is the AI employee and founder-facing operational interface who works through the OS.
                  </p>
                </div>
                <p>
                  <strong>Operational honesty statement:</strong>
                  Only Sophia Vance (COO) and Dr. Aris Thorne (Research) are part of the active v1 foundation loop. Maya Lin and Julian Cruz are v1 deferred; Elena Rostova and Marcus Vance are target-state planned architecture. All metrics in this prototype run within safe mock sandbox limits.
                </p>
                <div className="keyboard-help">
                  <span>
                    <kbd>/</kbd> Direct Sophia (Console)
                  </span>
                  <span>
                    <kbd>Space</kbd> Pause/Resume
                  </span>
                  <span>
                    <kbd>Esc</kbd> Close overlay
                  </span>
                  <span>
                    <kbd>Q</kbd> Work Queue
                  </span>
                </div>
                <p className="note">
                  Front-facing canvas rendering · Local preferences · Safe sandbox · Zero live side-effects
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OS WORK QUEUE / TODO SIDE DRAWER */}
      {queueOpen && (
        <div
          className="queue-drawer-backdrop"
          onClick={() => setQueueOpen(false)}
        />
      )}
      <aside
        className={'queue-drawer ' + (queueOpen ? 'open' : '')}
        role="complementary"
        aria-label="OS Work Queue and Task Sequence"
      >
        <header className="queue-header">
          <div>
            <div className="queue-title-eyebrow">
              <span className="queue-pulse-dot" />
              OS WORK QUEUE · PROTOCOL DAG
            </div>
            <h2 className="queue-main-title">Active Work Sequence</h2>
          </div>
          <button
            className="queue-close-btn"
            onClick={() => setQueueOpen(false)}
            aria-label="Close Work Queue (Esc)"
            title="Close Work Queue (Esc / Q)"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="queue-summary-banner">
          <i className="amber-dot" />
          <span>
            <strong>CALM OPERATIONAL QUEUE</strong> &mdash; Structured agent execution pipeline in safe sandbox. Real execution is founder-gated.
          </span>
        </div>

        <div className="queue-content">
          {/* CURRENT SECTION */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>CURRENTLY IN PROGRESS</span>
              <span>STEP 4 OF 9</span>
            </div>
            {queueTasks.filter(t => t.category === 'current').map(task => renderQueueCard(task))}
          </div>

          {/* NEXT SECTION */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>NEXT IN SEQUENCE</span>
              <span>STEP 5</span>
            </div>
            {queueTasks.filter(t => t.category === 'next').map(task => renderQueueCard(task))}
          </div>

          {/* THEN SECTION */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>UPCOMING PIPELINE (THEN)</span>
              <span>STEPS 6 & 7</span>
            </div>
            {queueTasks.filter(t => t.category === 'then').map(task => renderQueueCard(task))}
          </div>

          {/* WAITING SECTION */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>WAITING / FOUNDER GATES</span>
              <span style={{ color: '#f59e0b' }}>ACTION REQUIRED</span>
            </div>
            {queueTasks.filter(t => t.category === 'waiting').map(task => renderQueueCard(task))}
          </div>

          {/* COMPLETED SECTION */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>RECENTLY COMPLETED</span>
              <span>VERIFIED</span>
            </div>
            {queueTasks.filter(t => t.category === 'completed').map(task => renderQueueCard(task))}
          </div>
        </div>
      </aside>
    </div>
  );
}
