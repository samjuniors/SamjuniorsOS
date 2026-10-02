/**
 * ==========================================================================
 * SAMJUNIORS OS — CORE V4 PROTOTYPE SCRIPT
 * Founder Intent → Core Understands → Active Work → Authority Boundary
 *   → Outcome → Provenance / Learning
 * --------------------------------------------------------------------------
 * V4 evolution over V3:
 *   • Persistent WORK IDENTITY (threads survive state changes)
 *   • Conversational steering (free-text composer, visibly modifies work)
 *   • Founder interruption (new command redirects active work)
 *   • ATTENTION MODEL ("What matters now" — Core filters complexity)
 *   • Authority boundary (Core prepares; founder authorizes)
 *   • Outcome + evidence + provenance (work → result → evidence → learning)
 *   • The 7 V3 operational states remain INTERNAL to the Core's presence.
 * ALL STATE IS CLIENT-SIDE SIMULATION. No backend, no APIs, no persistence.
 * ==========================================================================
 */

(function () {
  'use strict';

  // ========================================================================
  // 0. INTERNAL CORE STATE MODEL (the 7 V3 states stay internal)
  // ========================================================================
  const CORE_STATES = {
    ready: {
      label: "Ready for your intent.",
      headline: "SAMJUNIORS CORE",
      tagline: "What do you need?",
      waveSpeed: 0.02,
      waveAmp: 5,
      color: '#00E5FF',
      secondaryColor: '#8B5CF6'
    },
    understanding: {
      label: "Understanding what you need…",
      headline: "UNDERSTANDING",
      tagline: "Reading your intent · gathering context",
      waveSpeed: 0.05,
      waveAmp: 12,
      color: '#38BDF8',
      secondaryColor: '#6366F1'
    },
    working: {
      label: "Working — researching and evaluating…",
      headline: "ACTIVE WORK",
      tagline: "Core is working on what you asked",
      waveSpeed: 0.06,
      waveAmp: 16,
      color: '#A855F7',
      secondaryColor: '#00E5FF'
    },
    waiting_for_founder: {
      label: "A decision needs you.",
      headline: "FOUNDER DECISION",
      tagline: "Core has prepared something that requires your judgment",
      waveSpeed: 0.02,
      waveAmp: 6,
      color: '#F59E0B',
      secondaryColor: '#F97316'
    },
    executing: {
      label: "Executing your approved action…",
      headline: "EXECUTING",
      tagline: "Running the action you authorized",
      waveSpeed: 0.07,
      waveAmp: 18,
      color: '#10B981',
      secondaryColor: '#00E5FF'
    },
    completed: {
      label: "Done — outcome ready for your review.",
      headline: "OUTCOME READY",
      tagline: "Work finished · evidence attached",
      waveSpeed: 0.015,
      waveAmp: 4,
      color: '#10B981',
      secondaryColor: '#8B5CF6'
    },
    blocked: {
      label: "Blocked — Core stopped safely.",
      headline: "BLOCKED",
      tagline: "A prerequisite was not satisfied",
      waveSpeed: 0.008,
      waveAmp: 3,
      color: '#F43F5E',
      secondaryColor: '#F59E0B'
    }
  };

  let currentState = 'ready';
  let currentMode = 'jarvis';
  let creditsAvailable = true;

  // ========================================================================
  // 1. DOM REFERENCES
  // ========================================================================
  const body = document.body;
  const $ = (id) => document.getElementById(id);

  const coreHeadline = $('coreHeadline');
  const coreTagline = $('coreTagline');
  const coreStatusLabel = $('coreStatusLabel');
  const toastNotification = $('toastNotification');
  const clockTime = $('clockTime');
  const clockDate = $('clockDate');

  // Header context strip
  const ctxWorkingOn = $('ctxWorkingOn');
  const ctxAttention = $('ctxAttention');
  const ctxClear = $('ctxClear');

  // Mode & credits
  const btnJarvisMode = $('btnJarvisMode');
  const btnManualMode = $('btnManualMode');
  const btnToggleCredits = $('btnToggleCredits');
  const creditsVal = $('creditsVal');
  const jarvisUnavailableBanner = $('jarvisUnavailableBanner');
  const btnRestoreCredits = $('btnRestoreCredits');
  const btnAtmosphereToggle = $('btnAtmosphereToggle');

  // Command
  const commandForm = $('commandForm');
  const commandInput = $('commandInput');
  const suggestedPromptsRow = $('suggestedPromptsRow');

  // Work surface panes
  const intentQuoteDisplay = $('intentQuoteDisplay');
  const understandingTitle = $('understandingTitle');
  const understandingDesc = $('understandingDesc');
  const understandingContextChips = $('understandingContextChips');

  const activeWorkTag = $('activeWorkTag');
  const activeWorkTitle = $('activeWorkTitle');
  const activeWorkWhy = $('activeWorkWhy');
  const activeWorkCurrentStep = $('activeWorkCurrentStep');
  const activeWorkEvidence = $('activeWorkEvidence');
  const activeWorkNext = $('activeWorkNext');
  const taskStepsChecklist = $('taskStepsChecklist');
  const btnWorkPause = $('btnWorkPause');
  const btnWorkSteer = $('btnWorkSteer');
  const btnWorkStop = $('btnWorkStop');
  const steeringAppliedNote = $('steeringAppliedNote');
  const steeringAppliedText = $('steeringAppliedText');

  // Decision pane
  const decisionTitle = $('decisionTitle');
  const decisionPrepared = $('decisionPrepared');
  const decisionReason = $('decisionReason');
  const decisionEvidence = $('decisionEvidence');
  const decisionRecommendation = $('decisionRecommendation');
  const btnDecisionApprove = $('btnDecisionApprove');
  const btnDecisionReject = $('btnDecisionReject');
  const btnDecisionRedirect = $('btnDecisionRedirect');
  const btnDecisionInspect = $('btnDecisionInspect');

  // Outcome pane
  const outcomeTag = $('outcomeTag');
  const outcomeTitle = $('outcomeTitle');
  const outcomeSummaryText = $('outcomeSummaryText');
  const outcomeEvidenceText = $('outcomeEvidenceText');
  const btnOutcomeReview = $('btnOutcomeReview');
  const btnOutcomeEvidence = $('btnOutcomeEvidence');
  const btnOutcomeProvenance = $('btnOutcomeProvenance');
  const btnOutcomeContinue = $('btnOutcomeContinue');

  // Interrupt pane
  const interruptPrevDirection = $('interruptPrevDirection');
  const interruptNewDirection = $('interruptNewDirection');

  // Blocked pane
  const blockedTitle = $('blockedTitle');
  const blockedCondition = $('blockedCondition');
  const blockedWhy = $('blockedWhy');
  const btnBlockedSteer = $('btnBlockedSteer');
  const btnDismissBlocked = $('btnDismissBlocked');

  // What matters strip
  const whatMattersStrip = $('whatMattersStrip');
  const wmState = $('wmState');

  // Work threads dock
  const workThreadsDock = $('workThreadsDock');
  const dockThreadsRow = $('dockThreadsRow');

  // Satellites
  const beaconCompanyState = $('beaconCompanyState');
  const beaconWorkforce = $('beaconWorkforce');
  const beaconDecisions = $('beaconDecisions');
  const beaconActivity = $('beaconActivity');
  const pillDecisionsMeta = $('pillDecisionsMeta');

  // Sheets & modals
  const sheetCompanyState = $('sheetCompanyState');
  const sheetActivity = $('sheetActivity');
  const sheetDecisions = $('sheetDecisions');
  const sheetWork = $('sheetWork');
  const workforceDrawer = $('workforceDrawer');
  const auditModal = $('auditModal');
  const auditScopeLine = $('auditScopeLine');
  const auditTableBody = $('auditTableBody');

  // Company state QA
  const qaHappening = $('qaHappening');
  const qaChanged = $('qaChanged');
  const qaAttention = $('qaAttention');
  const qaWorkedOn = $('qaWorkedOn');

  // Decisions sheet
  const decisionsEmpty = $('decisionsEmpty');
  const decisionsList = $('decisionsList');

  // Work sheet
  const workSheetEmpty = $('workSheetEmpty');
  const workSheetList = $('workSheetList');

  // Activity
  const activityStreamList = $('activityStreamList');

  // Steering composer
  const steeringComposer = $('steeringComposer');
  const steeringComposerTitle = $('steeringComposerTitle');
  const steeringForm = $('steeringForm');
  const steeringInput = $('steeringInput');
  const btnCloseSteering = $('btnCloseSteering');
  const btnSendSteering = $('btnSendSteering');

  // Messenger
  const messengerDrawer = $('messengerDrawer');
  const btnOpenMessenger = $('btnOpenMessenger');
  const btnCloseMessenger = $('btnCloseMessenger');
  const messengerForm = $('messengerForm');
  const messengerInput = $('messengerInput');
  const messengerMessages = $('messengerMessages');

  // Manual mode cards
  const cardManualCompany = $('cardManualCompany');
  const cardManualWork = $('cardManualWork');
  const cardManualDecisions = $('cardManualDecisions');
  const cardManualResearch = $('cardManualResearch');
  const cardManualWorkforce = $('cardManualWorkforce');
  const cardManualActivity = $('cardManualActivity');
  const cardManualAudit = $('cardManualAudit');
  const cardManualMessenger = $('cardManualMessenger');

  // Reset
  const btnResetDemo = $('btnResetDemo');

  // Canvas
  const coreCanvas = $('coreCanvas');
  const waveCanvas = $('waveCanvas');

  // ========================================================================
  // 2. PROCEDURAL STARFIELD BACKGROUND (carried from V3)
  // ========================================================================
  const starCanvas = $('starfieldCanvas');
  const starCtx = starCanvas ? starCanvas.getContext('2d') : null;
  let stars = [];

  function initStarfield() {
    if (!starCanvas || !starCtx) return;
    resizeStarfield();
    window.addEventListener('resize', resizeStarfield);
    stars = [];
    const count = Math.floor((starCanvas.width * starCanvas.height) / 5000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * starCanvas.width,
        y: Math.random() * (starCanvas.height * 0.75),
        radius: Math.random() * 1.3 + 0.3,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleOffset: Math.random() * Math.PI * 2
      });
    }
  }

  function resizeStarfield() {
    if (!starCanvas) return;
    starCanvas.width = window.innerWidth;
    starCanvas.height = window.innerHeight;
  }

  function drawStarfield(time) {
    if (!starCtx) return;
    starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
    for (let s of stars) {
      const alpha = s.alpha * (0.6 + 0.4 * Math.sin(time * s.twinkleSpeed + s.twinkleOffset));
      starCtx.fillStyle = `rgba(220, 240, 255, ${alpha.toFixed(3)})`;
      starCtx.beginPath();
      starCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      starCtx.fill();
    }
  }

  // ========================================================================
  // 3. PROCEDURAL CURVED EARTH HORIZON & CITY LIGHTS (carried from V3)
  // ========================================================================
  const earthCanvas = $('earthHorizonCanvas');
  const earthCtx = earthCanvas ? earthCanvas.getContext('2d') : null;
  let cityLightClusters = [];

  function initEarthHorizon() {
    if (!earthCanvas || !earthCtx) return;
    resizeEarthHorizon();
    window.addEventListener('resize', resizeEarthHorizon);
    cityLightClusters = [];
    const clusterCount = 14;
    for (let c = 0; c < clusterCount; c++) {
      const clusterX = 0.05 + Math.random() * 0.85;
      const points = [];
      const pointCount = 20 + Math.floor(Math.random() * 35);
      for (let p = 0; p < pointCount; p++) {
        points.push({
          dx: (Math.random() - 0.5) * 80,
          dy: Math.random() * 30,
          size: Math.random() * 1.6 + 0.6,
          hue: Math.random() > 0.3 ? 38 + Math.random() * 14 : 200 + Math.random() * 20,
          baseAlpha: Math.random() * 0.7 + 0.2
        });
      }
      cityLightClusters.push({ clusterX, points });
    }
  }

  function resizeEarthHorizon() {
    if (!earthCanvas) return;
    earthCanvas.width = window.innerWidth;
    earthCanvas.height = earthCanvas.parentElement.clientHeight;
  }

  function drawEarthHorizon(time) {
    if (!earthCtx) return;
    const w = earthCanvas.width;
    const h = earthCanvas.height;
    earthCtx.clearRect(0, 0, w, h);

    const startY = h * 0.45;
    const peakY = h * 0.32;
    const endY = h * 0.48;

    earthCtx.save();

    const glowGradient = earthCtx.createLinearGradient(0, peakY - 45, 0, peakY + 25);
    glowGradient.addColorStop(0, 'rgba(0, 229, 255, 0)');
    glowGradient.addColorStop(0.5, 'rgba(0, 180, 255, 0.18)');
    glowGradient.addColorStop(0.85, 'rgba(0, 229, 255, 0.45)');
    glowGradient.addColorStop(1, 'rgba(0, 255, 255, 0.75)');

    earthCtx.beginPath();
    earthCtx.moveTo(-50, startY);
    earthCtx.bezierCurveTo(w * 0.3, peakY, w * 0.7, peakY + 10, w + 50, endY);
    earthCtx.lineTo(w + 50, h + 50);
    earthCtx.lineTo(-50, h + 50);
    earthCtx.closePath();

    earthCtx.strokeStyle = glowGradient;
    earthCtx.lineWidth = 4;
    earthCtx.stroke();

    const surfaceGradient = earthCtx.createLinearGradient(0, peakY, 0, h);
    surfaceGradient.addColorStop(0, '#04070E');
    surfaceGradient.addColorStop(0.15, '#070C18');
    surfaceGradient.addColorStop(0.6, '#080E1C');
    surfaceGradient.addColorStop(1, '#05070D');
    earthCtx.fillStyle = surfaceGradient;
    earthCtx.fill();

    for (let cluster of cityLightClusters) {
      const cx = cluster.clusterX * w;
      const t = cluster.clusterX;
      const cy = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * peakY + t * t * endY;
      for (let pt of cluster.points) {
        const px = cx + pt.dx;
        const py = cy + 12 + pt.dy;
        if (py < cy) continue;
        const flicker = 0.7 + 0.3 * Math.sin(time * 0.003 + px);
        const alpha = (pt.baseAlpha * flicker).toFixed(2);
        earthCtx.fillStyle = `hsla(${pt.hue}, 90%, 65%, ${alpha})`;
        earthCtx.beginPath();
        earthCtx.arc(px, py, pt.size, 0, Math.PI * 2);
        earthCtx.fill();
      }
    }
    earthCtx.restore();
  }

  // ========================================================================
  // 4. PROCEDURAL LIVING INTELLIGENCE CORE (state-aware particles, from V3)
  // ========================================================================
  const coreCtx = coreCanvas ? coreCanvas.getContext('2d') : null;
  let coreParticles = [];

  function initCoreParticles() {
    coreParticles = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      coreParticles.push({
        baseAngle: Math.random() * Math.PI * 2,
        dist: Math.random() * 80 + 10,
        speed: Math.random() * 0.002 + 0.001,
        radius: Math.random() * 2 + 1,
        seed: Math.random() * 10
      });
    }
  }

  function drawLivingCore(time) {
    if (!coreCtx) return;
    const w = coreCanvas.width;
    const h = coreCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const stateMeta = CORE_STATES[currentState] || CORE_STATES.ready;

    coreCtx.clearRect(0, 0, w, h);
    const radius = 95;
    coreCtx.save();

    // 1. External bloom
    const bloomGrad = coreCtx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    bloomGrad.addColorStop(0, stateMeta.color + '44');
    bloomGrad.addColorStop(0.5, stateMeta.secondaryColor + '18');
    bloomGrad.addColorStop(1, 'transparent');
    coreCtx.fillStyle = bloomGrad;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
    coreCtx.fill();

    // 2. Body shading
    const lightX = cx + radius * 0.45;
    const lightY = cy - radius * 0.4;
    const sphereGrad = coreCtx.createRadialGradient(lightX, lightY, 5, cx, cy, radius);
    if (currentState === 'blocked') {
      sphereGrad.addColorStop(0, '#5A121D');
      sphereGrad.addColorStop(0.5, '#2A080D');
      sphereGrad.addColorStop(1, '#080204');
    } else if (currentState === 'waiting_for_founder') {
      sphereGrad.addColorStop(0, '#5C3806');
      sphereGrad.addColorStop(0.5, '#291703');
      sphereGrad.addColorStop(1, '#0A0501');
    } else {
      sphereGrad.addColorStop(0, '#1E2D4A');
      sphereGrad.addColorStop(0.35, '#0E1729');
      sphereGrad.addColorStop(0.7, '#070B14');
      sphereGrad.addColorStop(1, '#04060B');
    }
    coreCtx.fillStyle = sphereGrad;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    coreCtx.fill();

    // 3. Iridescent rim
    const rimGrad = coreCtx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    rimGrad.addColorStop(0, stateMeta.color);
    rimGrad.addColorStop(0.4, stateMeta.secondaryColor);
    rimGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.8)');
    rimGrad.addColorStop(1, 'transparent');
    coreCtx.strokeStyle = rimGrad;
    coreCtx.lineWidth = 2.4;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    coreCtx.stroke();

    // 4. Living particle field (state-specific)
    for (let p of coreParticles) {
      let px = cx;
      let py = cy;

      if (currentState === 'ready') {
        const angle = p.baseAngle + time * (p.speed * 0.8);
        const dist = (p.dist * 0.7) * (0.8 + 0.2 * Math.sin(time * 0.001 + p.seed));
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.6;
      } else if (currentState === 'understanding') {
        const inwardT = (Math.sin(time * 0.002 + p.seed) + 1) * 0.5;
        const dist = 85 * (1 - inwardT * 0.7);
        const angle = p.baseAngle + time * 0.002;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.7;
      } else if (currentState === 'working') {
        const angle = p.baseAngle + time * (p.speed * 3.0);
        const dist = p.dist * 0.8;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.8;
      } else if (currentState === 'waiting_for_founder') {
        const angle = p.baseAngle + time * (p.speed * 0.2);
        const dist = 30 + 20 * Math.sin(time * 0.001 + p.seed);
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.9;
      } else if (currentState === 'executing') {
        const flowX = Math.sin(time * 0.003 + p.seed) * 75;
        const flowY = Math.cos(time * 0.0015 + p.seed) * 25;
        px = cx + flowX;
        py = cy + flowY;
      } else if (currentState === 'completed') {
        const angle = p.baseAngle + time * 0.0006;
        const dist = p.dist * 0.6;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.6;
      } else if (currentState === 'blocked') {
        const angle = p.baseAngle;
        const dist = radius * 0.85;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.6;
      }

      const pAlpha = 0.35 + 0.45 * Math.sin(time * 0.003 + p.seed);
      coreCtx.fillStyle = stateMeta.color;
      coreCtx.globalAlpha = pAlpha;
      coreCtx.beginPath();
      coreCtx.arc(px, py, p.radius, 0, Math.PI * 2);
      coreCtx.fill();
    }
    coreCtx.globalAlpha = 1.0;

    // 5. Lens flare
    const flareX = cx + radius * 0.68;
    const flareY = cy - radius * 0.68;
    const flareGrad = coreCtx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 26);
    flareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    flareGrad.addColorStop(0.35, stateMeta.color);
    flareGrad.addColorStop(1, 'transparent');
    coreCtx.fillStyle = flareGrad;
    coreCtx.beginPath();
    coreCtx.arc(flareX, flareY, 26, 0, Math.PI * 2);
    coreCtx.fill();

    coreCtx.restore();
  }

  // ========================================================================
  // 5. FREQUENCY WAVE (carried from V3)
  // ========================================================================
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

  function drawFrequencyWave(time) {
    if (!waveCtx) return;
    const w = waveCanvas.width;
    const h = waveCanvas.height;
    const cy = h / 2;
    const meta = CORE_STATES[currentState] || CORE_STATES.ready;

    waveCtx.clearRect(0, 0, w, h);
    waveCtx.save();
    waveCtx.lineWidth = 1.8;
    waveCtx.lineCap = 'round';

    const waves = [
      { speed: meta.waveSpeed, amp: meta.waveAmp, freq: 0.02, color: meta.color, alpha: 0.85 },
      { speed: -meta.waveSpeed * 1.3, amp: meta.waveAmp * 0.6, freq: 0.035, color: meta.secondaryColor, alpha: 0.5 }
    ];

    for (let wConfig of waves) {
      waveCtx.strokeStyle = wConfig.color;
      waveCtx.globalAlpha = wConfig.alpha;
      waveCtx.beginPath();
      for (let x = 0; x < w; x++) {
        const taper = Math.sin((x / w) * Math.PI);
        const y = cy + Math.sin(x * wConfig.freq + time * wConfig.speed) * wConfig.amp * taper;
        if (x === 0) waveCtx.moveTo(x, y);
        else waveCtx.lineTo(x, y);
      }
      waveCtx.stroke();
    }
    waveCtx.restore();
  }

  function renderLoop(time) {
    drawStarfield(time);
    drawEarthHorizon(time);
    drawLivingCore(time);
    drawFrequencyWave(time);
    requestAnimationFrame(renderLoop);
  }

  // ========================================================================
  // 6. TOAST + CLOCK
  // ========================================================================
  let toastTimer = null;
  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNotification.classList.remove('visible');
    }, 3200);
  }

  function updateClock() {
    if (!clockTime) return;
    const now = new Date();
    clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (clockDate) {
      clockDate.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    }
  }

  // ========================================================================
  // 7. WORK ENGINE — PERSISTENT WORK IDENTITY (V4 core)
  // ========================================================================
  // Work templates: illustrative interpretations of founder intent.
  // These are DEMO definitions — no live systems are connected.
  const WORK_TEMPLATES = [
    {
      match: /positioning/i,
      title: 'Positioning Review',
      desc: 'Evaluate current positioning against verified evidence and prepare a recommendation.',
      why: 'Founder intent: refine positioning before the next strategic move.',
      chips: ['Company state', 'Recent decisions', 'Product context', 'Verified evidence'],
      steps: ['Context gathered', 'Relevant sources identified', 'Evaluating findings', 'Prepare recommendation'],
      nextLine: 'Compare verified findings against current company priorities.',
      evidence: { sources: 4, verified: 2, pending: 1 },
      consequential: true,
      decision: {
        title: 'Release recommendation',
        prepared: 'Release recommendation',
        reason: 'This action has external consequences. Requires founder approval before external execution.',
        recommendation: 'Proceed'
      },
      outcome: 'A recommendation is ready for your review.'
    },
    {
      match: /review|chang|happened|weekly/i,
      title: 'Company Review',
      desc: 'Compare recent company state, decisions, activity and available intelligence.',
      why: 'Founder intent: understand what changed before deciding next steps.',
      chips: ['Company state', 'Recent decisions', 'Activity', 'Available intelligence'],
      steps: ['Context gathered', 'Recent decisions read', 'Activity reviewed', 'Summarize changes'],
      nextLine: 'Summarize what changed since the last review.',
      evidence: { sources: 3, verified: 2, pending: 1 },
      consequential: false,
      decision: null,
      outcome: 'A summary of what changed is ready. One finding requires verification — added to WATCH.',
      createsWatch: true
    },
    {
      match: /priorit/i,
      title: "Today's Priorities",
      desc: 'Prepare today\u2019s priorities from active work, pending decisions and current state.',
      why: 'Founder intent: start the day with a clear picture of what matters.',
      chips: ['Active work', 'Pending decisions', 'Attention state', 'Current priorities'],
      steps: ['Active work read', 'Pending decisions read', 'Attention state evaluated', 'Draft priorities'],
      nextLine: 'Order priorities by founder attention and consequence.',
      evidence: { sources: 2, verified: 2, pending: 0 },
      consequential: false,
      decision: null,
      outcome: 'Priorities are prepared from current simulated work and decisions.'
    },
    {
      match: /market|opportunit|investigat|research/i,
      title: 'Market Opportunity Investigation',
      desc: 'Investigate the opportunity, evaluate available evidence, and prepare a response recommendation.',
      why: 'Founder intent: understand this opportunity before committing.',
      chips: ['Market signals', 'Company context', 'Relevant evidence', 'Prior decisions'],
      steps: ['Context gathered', 'Signals identified', 'Evidence evaluated', 'Prepare response recommendation'],
      nextLine: 'Weigh verified evidence against company priorities.',
      evidence: { sources: 5, verified: 3, pending: 1 },
      consequential: true,
      decision: {
        title: 'Market response recommendation',
        prepared: 'Market response recommendation',
        reason: 'Acting on this opportunity has external consequences. Requires founder approval before external execution.',
        recommendation: 'Proceed'
      },
      outcome: 'A market response recommendation is ready for your review.'
    }
  ];

  const GENERIC_TEMPLATE = {
    title: null, // derived from command
    desc: 'Break the request into steps, gather context, and prepare a result for your review.',
    why: 'Founder intent — see your original request.',
    chips: ['Company state', 'Active work', 'Available intelligence'],
    steps: ['Context gathered', 'Approach defined', 'Working', 'Prepare result'],
    nextLine: 'Prepare the result for founder review.',
    evidence: { sources: 3, verified: 1, pending: 1 },
    consequential: true,
    decision: {
      title: 'Proposed action',
      prepared: 'Proposed action prepared from this work',
      reason: 'This action has external consequences. Requires founder approval before external execution.',
      recommendation: 'Proceed'
    },
    outcome: 'A result is ready for your review.'
  };

  const WorkEngine = {
    threads: [],
    decisionRecords: [],
    seq: 0,
    timers: {},
    activeId: null,

    threadById(id) {
      return this.threads.find(t => t.id === id) || null;
    },

    activeThread() {
      const t = this.threadById(this.activeId);
      if (t && ['researching', 'executing', 'awaiting'].includes(t.status)) return t;
      return null;
    },

    anyRunning() {
      return this.threads.some(t => ['researching', 'executing'].includes(t.status));
    },

    createThread(commandText) {
      const lower = commandText.toLowerCase();
      let tpl = WORK_TEMPLATES.find(t => t.match.test(lower));
      let derivedTitle = null;
      if (!tpl) {
        tpl = GENERIC_TEMPLATE;
        derivedTitle = toTitleCase(commandText.replace(/[.!?]+$/, ''));
      }

      const thread = {
        id: 'w' + (++this.seq),
        title: tpl.title || derivedTitle,
        desc: tpl.desc,
        why: tpl.why,
        chips: tpl.chips,
        steps: tpl.steps.map(s => ({ label: s, state: 'pending' })),
        stepIndex: -1,
        nextLine: tpl.nextLine,
        evidence: { sources: 0, verified: 0, pending: 0 },
        evidenceTarget: tpl.evidence,
        consequential: tpl.consequential,
        decision: tpl.decision,
        outcome: tpl.outcome,
        createsWatch: !!tpl.createsWatch,
        watchItem: false,
        steeringHistory: [],
        status: 'researching',
        startedAt: new Date(),
        focusNote: null
      };
      this.threads.push(thread);
      return thread;
    },

    clearTimers(id) {
      if (this.timers[id]) {
        clearTimeout(this.timers[id]);
        delete this.timers[id];
      }
    },

    startProgress(thread) {
      this.clearTimers(thread.id);
      thread.status = 'researching';
      this.scheduleNextStep(thread);
    },

    scheduleNextStep(thread) {
      const nextIdx = thread.steps.findIndex(s => s.state === 'pending');
      if (nextIdx === -1) { this.finishResearch(thread); return; }
      const delay = 2600 + Math.random() * 900;
      this.timers[thread.id] = setTimeout(() => {
        this.advanceStep(thread, nextIdx);
      }, delay);
    },

    advanceStep(thread, idx) {
      if (thread.status !== 'researching') return; // paused/stopped/awaiting
      thread.stepIndex = idx;
      thread.steps[idx].state = 'active';
      // evidence ticks up as research progresses
      const progress = (idx + 1) / (thread.steps.length);
      thread.evidence.sources = Math.min(
        thread.evidenceTarget.sources,
        Math.ceil(thread.evidenceTarget.sources * progress)
      );
      thread.evidence.pending = Math.min(
        thread.evidenceTarget.verified + thread.evidenceTarget.pending,
        Math.ceil((thread.evidenceTarget.verified + thread.evidenceTarget.pending) * (0.4 + progress * 0.6))
      );
      addActivity(`${thread.title} — ${thread.steps[idx].label.toLowerCase()}`, 'work');
      renderAll();
      const delay = 2400 + Math.random() * 800;
      this.timers[thread.id] = setTimeout(() => {
        if (thread.status !== 'researching') return;
        thread.steps[idx].state = 'done';
        const stillPending = thread.steps.some(s => s.state === 'pending');
        if (stillPending) {
          this.scheduleNextStep(thread);
        } else {
          this.finishResearch(thread);
        }
        renderAll();
      }, delay);
    },

    finishResearch(thread) {
      // finalize evidence
      thread.evidence = { ...thread.evidenceTarget };
      if (thread.consequential && thread.decision) {
        thread.status = 'awaiting';
        const record = {
          id: 'd' + (++this.seq),
          threadId: thread.id,
          title: thread.decision.title,
          prepared: thread.decision.prepared,
          reason: thread.decision.reason,
          status: 'pending'
        };
        this.decisionRecords.unshift(record);
        addActivity(`Decision required: ${record.prepared}`, 'decision');
        addMessengerMessage('Core', 'One item needs your attention.');
        setCoreState('waiting_for_founder', false);
        focusThread(thread.id, { silent: true });
      } else {
        this.completeThread(thread, thread.outcome);
      }
      renderAll();
    },

    completeThread(thread, outcomeText) {
      thread.status = 'completed';
      thread.outcomeShown = outcomeText || thread.outcome;
      if (thread.createsWatch && thread.evidence.pending > 0) {
        thread.watchItem = true;
      }
      addActivity(`Completed: ${thread.title}`, 'success');
      addMessengerMessage('Sophia', 'Your requested review is ready.');
      setCoreState('completed', false);
      renderAll();
    },

    pauseThread(thread) {
      if (thread.status !== 'researching') return;
      this.clearTimers(thread.id);
      thread.status = 'paused';
      addActivity(`Paused by founder: ${thread.title}`, 'info');
      renderAll();
    },

    resumeThread(thread) {
      if (thread.status !== 'paused') return;
      thread.status = 'researching';
      addActivity(`Resumed: ${thread.title}`, 'info');
      this.scheduleNextStep(thread);
      setCoreState('working', false);
      renderAll();
    },

    stopThread(thread, reason) {
      this.clearTimers(thread.id);
      thread.status = 'stopped';
      thread.stopReason = reason || 'Stopped by founder.';
      addActivity(`Stopped: ${thread.title} — ${thread.stopReason}`, 'stop');
      renderAll();
    },

    steerThread(thread, text) {
      const clean = text.trim();
      if (!clean) return;
      thread.steeringHistory.push(clean);
      thread.focusNote = clean;

      // "stop researching and give me the recommendation" — finalize now
      if (/stop.*research|current recommendation|give me the (current )?recommendation/i.test(clean)) {
        addActivity(`Founder steered: \u201C${clean}\u201D`, 'steer');
        thread.steps.forEach(s => { if (s.state !== 'done') s.state = 'done'; });
        this.clearTimers(thread.id);
        if (thread.status === 'awaiting') {
          renderAll();
          showToast('Steering applied (simulation): Core is finalizing the current recommendation.');
        } else if (thread.status === 'researching') {
          this.finishResearch(thread);
        }
        return;
      }

      // Insert an adjustment step and keep working
      if (thread.status === 'researching') {
        const adjusted = { label: 'Adjusting to founder steering', state: 'active' };
        thread.steps = thread.steps.map(s => (s.state === 'active' ? { ...s, state: 'pending', label: s.label } : s));
        // put the adjustment step right before the remaining work
        const firstPending = thread.steps.findIndex(s => s.state === 'pending');
        if (firstPending === -1) thread.steps.push(adjusted);
        else thread.steps.splice(firstPending, 0, adjusted);
        thread.steps = thread.steps.filter(s => s.state !== 'active' || s === adjusted);
        thread.stepIndex = thread.steps.indexOf(adjusted);
        this.clearTimers(thread.id);
        thread.status = 'researching';
        this.timers[thread.id] = setTimeout(() => {
          adjusted.state = 'done';
          renderAll();
          this.scheduleNextStep(thread);
        }, 1600);
      } else if (thread.status === 'awaiting') {
        // Steered at the decision gate: Core goes back to work with new direction
        thread.status = 'researching';
        thread.decision = thread.decision || {};
        thread.decision.recommendation = 'Refine and re-prepare';
        const rec = this.decisionRecords.find(r => r.threadId === thread.id && r.status === 'pending');
        if (rec) rec.status = 'redirected';
        const adjusted = { label: 'Re-evaluating with founder direction', state: 'active' };
        thread.steps.push(adjusted);
        thread.stepIndex = thread.steps.indexOf(adjusted);
        this.clearTimers(thread.id);
        this.timers[thread.id] = setTimeout(() => {
          adjusted.state = 'done';
          const final = { label: 'Re-prepare recommendation', state: 'pending' };
          thread.steps.push(final);
          renderAll();
          this.scheduleNextStep(thread);
        }, 1800);
      }

      addActivity(`Founder steered: \u201C${clean}\u201D`, 'steer');
      showToast(`Steering applied (simulation): \u201C${clean}\u201D`);
      setCoreState('working', false);
      renderAll();
    },

    decide(threadId, action) {
      const thread = this.threadById(threadId);
      const record = this.decisionRecords.find(r => r.threadId === threadId && r.status === 'pending');
      if (!thread || !record) return;

      if (action === 'approve') {
        record.status = 'approved';
        record.decidedAt = new Date();
        thread.status = 'executing';
        addActivity(`Founder APPROVED: ${record.prepared}`, 'decision');
        addMessengerMessage('Core', 'Understood. Executing the action you approved.');
        setCoreState('executing', false);
        renderAll();
        this.timers[thread.id] = setTimeout(() => {
          this.completeThread(thread, `${record.prepared} was executed. The result is recorded with evidence attached.`);
        }, 2400);
      } else if (action === 'reject') {
        record.status = 'rejected';
        record.decidedAt = new Date();
        this.clearTimers(thread.id);
        thread.status = 'rejected';
        thread.outcomeShown = 'Rejected by founder — no action was taken. Core will not retry without a new instruction.';
        addActivity(`Founder REJECTED: ${record.prepared}`, 'stop');
        addMessengerMessage('Core', 'Understood. The proposed action was rejected — nothing was executed.');
        setCoreState('ready', false);
        showToast('Rejected (simulation). Core stopped this work. The thread stays available below.');
        renderAll();
      }
    },

    reset() {
      Object.keys(this.timers).forEach(id => this.clearTimers(id));
      this.threads = [];
      this.decisionRecords = [];
      this.seq = 0;
      this.activeId = null;
    }
  };

  function toTitleCase(text) {
    return text.split(/\s+/).slice(0, 6).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ========================================================================
  // 8. ATTENTION MODEL — WHAT MATTERS NOW
  // ========================================================================
  function computeAttention() {
    const decisions = WorkEngine.decisionRecords.filter(r => r.status === 'pending').length;
    const activeWork = WorkEngine.threads.filter(t => ['researching', 'executing'].includes(t.status)).length;
    const watch = WorkEngine.threads.filter(t => t.watchItem).length;
    return { decisions, activeWork, watch };
  }

  function renderAttention() {
    const a = computeAttention();

    // --- What matters strip ---
    let html = '';
    whatMattersStrip.classList.toggle('attention-mode', a.decisions > 0);
    if (a.decisions > 0) {
      wmState.className = 'wm-state wm-attention';
      html = `<span class="wm-badge badge-amber"><span class="wm-dot dot-amber"></span> ATTENTION REQUIRED</span> <span class="wm-sep">—</span> <span class="wm-desc">${a.decisions} founder decision${a.decisions > 1 ? 's' : ''} awaiting judgment</span>`;
      if (a.activeWork > 0) html += `<span class="wm-sep">·</span><span class="wm-sub">${a.activeWork} active</span>`;
    } else if (a.activeWork > 0) {
      wmState.className = 'wm-state wm-working';
      html = `<span class="wm-badge badge-purple"><span class="wm-dot dot-purple"></span> WORK IN PROGRESS</span> <span class="wm-sep">—</span> <span class="wm-desc">${a.activeWork} active work item${a.activeWork > 1 ? 's' : ''}</span>`;
    } else if (a.watch > 0) {
      wmState.className = 'wm-state wm-watch';
      html = `<span class="wm-badge badge-cyan"><span class="wm-dot dot-cyan"></span> WATCH</span> <span class="wm-sep">—</span> <span class="wm-desc">A finding needs review (${a.watch} unresolved)</span>`;
    } else {
      wmState.className = 'wm-state wm-clear';
      html = `<span class="wm-badge badge-clear"><span class="wm-dot dot-clear"></span> CLEAR</span> <span class="wm-sep">—</span> <span class="wm-desc">Nothing currently requires your attention.</span>`;
    }
    wmState.innerHTML = html;

    // --- Header context strip ---
    const active = WorkEngine.activeThread() || WorkEngine.threads.find(t => t.status === 'awaiting');
    body.classList.toggle('attention-active', a.decisions > 0);
    if (ctxAttention) ctxAttention.textContent = `ATTENTION ${a.decisions}`;
    if (ctxWorkingOn) {
      if (a.decisions > 0) {
        const pending = WorkEngine.threads.find(t => t.status === 'awaiting');
        ctxWorkingOn.textContent = `DECISION · ${pending ? pending.title.toUpperCase() : 'FOUNDER'}`;
      } else if (active && active.status !== 'completed') {
        ctxWorkingOn.textContent = `WORKING ON · ${active.title.toUpperCase()}`;
      } else {
        ctxWorkingOn.textContent = 'CLEAR';
      }
    }

    // --- Decisions satellite meta ---
    if (pillDecisionsMeta) {
      pillDecisionsMeta.textContent = a.decisions > 0 ? `${a.decisions} pending` : '—';
    }

    // --- Company state QA answers (derived from simulation) ---
    if (qaAttention) {
      qaAttention.textContent = a.decisions > 0
        ? `${a.decisions} founder decision${a.decisions > 1 ? 's' : ''} awaiting your judgment (simulated).`
        : 'Nothing requires founder action in this simulation.';
    }
    if (qaWorkedOn) {
      const activeTitles = WorkEngine.threads.filter(t => ['researching', 'executing', 'awaiting', 'paused'].includes(t.status)).map(t => t.title);
      qaWorkedOn.textContent = activeTitles.length ? activeTitles.join(' · ') : 'No active work threads.';
    }
    if (qaChanged) {
      const recent = activityEvents.slice(1, 4).map(e => e.text);
      qaChanged.textContent = recent.length ? `Recent (simulated): ${recent.join(' · ')}` : 'No live company data connected — nothing to report.';
    }
  }

  // What-matters strip click: route to the relevant surface
  function onWhatMattersClick() {
    const a = computeAttention();
    if (a.decisions > 0) {
      toggleDecisionsSheet(true);
    } else if (a.activeWork > 0) {
      const t = WorkEngine.activeThread();
      if (t) focusThread(t.id);
    } else if (a.watch > 0) {
      toggleActivitySheet(true);
    } else {
      showToast('Nothing needs you right now (simulation).');
    }
  }

  // ========================================================================
  // 9. THREAD RENDERING (dock + active work pane + work sheet)
  // ========================================================================
  const STATUS_LABELS = {
    researching: 'Researching',
    executing: 'Executing',
    awaiting: 'Needs Founder',
    completed: 'Completed',
    paused: 'Paused',
    stopped: 'Stopped',
    rejected: 'Rejected',
    redirected: 'Redirected'
  };

  function renderDock() {
    const hasThreads = WorkEngine.threads.length > 0;
    workThreadsDock.classList.toggle('visible', hasThreads);
    workThreadsDock.setAttribute('aria-hidden', hasThreads ? 'false' : 'true');
    if (!hasThreads) { dockThreadsRow.innerHTML = ''; return; }

    dockThreadsRow.innerHTML = WorkEngine.threads.map(t => {
      const done = t.steps.filter(s => s.state === 'done').length;
      const pct = Math.round((done / t.steps.length) * 100);
      const focused = WorkEngine.activeId === t.id;
      const isRunning = ['researching', 'executing', 'awaiting'].includes(t.status);
      return `
        <div class="thread-card status-${t.status} ${focused ? 'focused' : ''}" data-thread="${t.id}" role="button" tabindex="0" aria-label="Work thread ${t.title}, ${STATUS_LABELS[t.status]}">
          <div class="thread-card-top">
            <span class="thread-status-chip st-${t.status}">${STATUS_LABELS[t.status]}</span>
            <span class="thread-started">started ${formatStarted(t.startedAt)}</span>
          </div>
          <span class="thread-title">${escapeHtml(t.title)}</span>
          <span class="thread-sub">${escapeHtml(t.steps[Math.max(t.stepIndex, 0)] ? t.steps[Math.max(t.stepIndex, 0)].label : t.steps[0].label)}</span>
          <div class="thread-progress-track"><div class="thread-progress-fill" style="width:${pct}%"></div></div>
          <span class="thread-evidence-mini">${t.evidence.sources} sources · ${t.evidence.pending} pending</span>
          ${t.steeringHistory.length ? `<span class="thread-steered-flag">⇄ steered ×${t.steeringHistory.length}</span>` : ''}
          <div class="thread-actions">
            ${t.status === 'paused' ? `<button type="button" class="thread-btn" data-action="resume" data-thread="${t.id}">Continue</button>` : ''}
            ${isRunning && t.status !== 'awaiting' ? `<button type="button" class="thread-btn" data-action="pause" data-thread="${t.id}">Pause</button>` : ''}
            ${t.status === 'awaiting' ? `<button type="button" class="thread-btn" data-action="focus" data-thread="${t.id}">Decide</button>` : ''}
            ${t.status === 'completed' || t.status === 'rejected' ? `<button type="button" class="thread-btn" data-action="focus" data-thread="${t.id}">Inspect</button>` : ''}
            ${isRunning ? `<button type="button" class="thread-btn tb-stop" data-action="stop" data-thread="${t.id}">Stop</button>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function renderActiveSheet(thread) {
    if (!thread) return;
    const t = thread;
    const tagText = t.status === 'executing'
      ? 'Executing'
      : t.status === 'paused'
        ? 'Paused'
        : 'Researching';
    activeWorkTag.textContent = tagText;
    activeWorkTitle.textContent = t.title;
    activeWorkWhy.textContent = t.focusNote ? `${t.why} Founder steered: \u201C${t.focusNote}\u201D` : t.why;
    const activeStep = t.steps.find(s => s.state === 'active');
    const nextPending = t.steps.find(s => s.state === 'pending');
    const lastDone = [...t.steps].reverse().find(s => s.state === 'done');
    activeWorkCurrentStep.textContent = activeStep ? activeStep.label : (nextPending ? nextPending.label : (lastDone ? lastDone.label : 'Preparing'));
    activeWorkEvidence.textContent = `${t.evidence.sources} source${t.evidence.sources === 1 ? '' : 's'} evaluated · ${t.evidence.pending} pending`;
    activeWorkNext.textContent = t.nextLine;
    btnWorkPause.textContent = t.status === 'paused' ? '▶ Continue' : '⏸ Pause';

    taskStepsChecklist.innerHTML = t.steps.map(s => {
      if (s.state === 'done') return `<div class="step-row done"><span class="step-check">✓</span><span class="step-label">${escapeHtml(s.label)}</span><span class="step-status-tag">Done</span></div>`;
      if (s.state === 'active') return `<div class="step-row active"><span class="step-check spinner-dot"></span><span class="step-label">${escapeHtml(s.label)}</span><span class="step-status-tag active">In Progress</span></div>`;
      return `<div class="step-row pending"><span class="step-check">○</span><span class="step-label">${escapeHtml(s.label)}</span><span class="step-status-tag">Queued</span></div>`;
    }).join('');

    if (t.steeringHistory.length) {
      steeringAppliedNote.classList.add('visible');
      steeringAppliedNote.setAttribute('aria-hidden', 'false');
      steeringAppliedText.textContent = t.steeringHistory[t.steeringHistory.length - 1];
    } else {
      steeringAppliedNote.classList.remove('visible');
      steeringAppliedNote.setAttribute('aria-hidden', 'true');
    }
  }

  function renderDecisionPane(thread) {
    if (!thread || !thread.decision) return;
    const t = thread;
    decisionTitle.textContent = t.decision.title;
    decisionPrepared.textContent = t.decision.prepared;
    decisionReason.textContent = t.decision.reason;
    decisionEvidence.textContent = evidenceLine(t.evidence);
    decisionRecommendation.textContent = t.decision.recommendation || 'Proceed';
  }

  function renderOutcomePane(thread) {
    if (!thread) return;
    const isRejected = thread.status === 'rejected';
    outcomeTag.textContent = isRejected ? 'REJECTED' : 'COMPLETED';
    outcomeTag.className = isRejected ? 'pane-tag tag-danger' : 'pane-tag tag-success';
    outcomeTitle.textContent = thread.title;
    outcomeSummaryText.textContent = thread.outcomeShown || thread.outcome;
    outcomeEvidenceText.textContent = evidenceLine(thread.evidence);
  }

  function evidenceLine(ev) {
    return `${ev.sources} sources · ${ev.verified} verified finding${ev.verified === 1 ? '' : 's'} · ${ev.pending} pending claim${ev.pending === 1 ? '' : 's'}`;
  }

  function formatStarted(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'recently';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Focus a thread: drives which pane the work surface shows
  function focusThread(id, opts) {
    const silent = opts && opts.silent;
    WorkEngine.activeId = id;
    const t = WorkEngine.threadById(id);
    if (!t) return;

    if (t.status === 'awaiting') {
      setCoreState('waiting_for_founder', silent ? false : true);
      renderDecisionPane(t);
    } else if (t.status === 'completed' || t.status === 'rejected') {
      setCoreState('completed', !silent);
      renderOutcomePane(t);
    } else if (t.status === 'researching' || t.status === 'executing' || t.status === 'paused') {
      setCoreState(t.status === 'executing' ? 'executing' : 'working', !silent);
      renderActiveSheet(t);
    } else if (t.status === 'stopped' || t.status === 'redirected') {
      setCoreState('ready', false);
    }
    renderAll();
  }

  function renderWorkSheet() {
    const has = WorkEngine.threads.length > 0;
    workSheetEmpty.style.display = has ? 'none' : 'flex';
    workSheetList.style.display = has ? 'flex' : 'none';
    workSheetList.setAttribute('aria-hidden', has ? 'false' : 'true');
    if (!has) { workSheetList.innerHTML = ''; return; }
    workSheetList.innerHTML = WorkEngine.threads.map(t => `
      <div class="ws-thread-row">
        <div class="ws-row-top">
          <span class="ws-row-title">${escapeHtml(t.title)}</span>
          <span class="thread-status-chip st-${t.status}">${STATUS_LABELS[t.status]}</span>
        </div>
        <span class="ws-row-sub">${escapeHtml(t.desc)}</span>
        <div class="ws-row-actions">
          <button type="button" class="ws-btn" data-sheet-action="focus" data-thread="${t.id}">Open in Core view</button>
        </div>
      </div>`).join('');
  }

  function renderDecisionsSheet() {
    const pending = WorkEngine.decisionRecords.filter(r => r.status === 'pending');
    const history = WorkEngine.decisionRecords.filter(r => r.status !== 'pending');
    const hasAny = WorkEngine.decisionRecords.length > 0;
    decisionsEmpty.style.display = hasAny ? 'none' : 'flex';
    decisionsList.style.display = hasAny ? 'flex' : 'none';
    decisionsList.setAttribute('aria-hidden', hasAny ? 'false' : 'true');
    if (!hasAny) return;

    const card = (r) => `
      <div class="decision-record-card" data-decision="${r.id}">
        <span class="dec-record-status ${r.status}">${r.status.toUpperCase()}</span>
        <span class="dec-record-title">${escapeHtml(r.title)}</span>
        <span class="dec-record-meta">Core prepared: ${escapeHtml(r.prepared)}<br>${escapeHtml(r.reason)}</span>
        <span class="dec-record-meta">Evidence: ${evidenceLineForThread(r.threadId)}</span>
      </div>`;
    decisionsList.innerHTML =
      pending.map(card).join('') +
      (history.length ? `<div class="steering-examples-caption" style="margin-top:6px;">RECORD</div>` + history.map(card).join('') : '');
  }

  function evidenceLineForThread(threadId) {
    const t = WorkEngine.threadById(threadId);
    return t ? evidenceLine(t.evidence) : '—';
  }

  // ========================================================================
  // 10. ACTIVITY STREAM + MESSENGER (simulated events)
  // ========================================================================
  let activityEvents = [];

  function addActivity(text, kind) {
    activityEvents.unshift({ text, kind, time: new Date() });
    activityEvents = activityEvents.slice(0, 30);
    renderActivity();
  }

  function renderActivity() {
    if (!activityStreamList) return;
    activityStreamList.innerHTML = activityEvents.map(e => {
      const dot = e.kind === 'decision' ? 'dot-amber' : e.kind === 'success' ? 'dot-emerald' : e.kind === 'steer' ? 'dot-purple' : e.kind === 'stop' ? 'dot-rose' : 'dot-cyan';
      const timeStr = e.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <li class="activity-item">
          <span class="status-dot ${dot}"></span>
          <div class="activity-details">
            <span class="activity-text">${escapeHtml(e.text)}</span>
            <span class="activity-time">Simulated · ${timeStr}</span>
          </div>
        </li>`;
    }).join('');
  }

  function addMessengerMessage(sender, text) {
    if (!messengerMessages) return;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble msg-agent';
    bubble.innerHTML = `<div class="msg-sender">${escapeHtml(sender)}</div><div class="msg-content">${escapeHtml(text)}</div>`;
    messengerMessages.appendChild(bubble);
    messengerMessages.scrollTop = messengerMessages.scrollHeight;
  }

  // ========================================================================
  // 11. PROVENANCE MODAL (scoped to a thread)
  // ========================================================================
  function openProvenance(threadId) {
    const t = threadId ? WorkEngine.threadById(threadId) : (WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null);
    if (t) {
      auditScopeLine.textContent = `Illustrative provenance chain — ${t.title} (simulation).`;
      const decision = WorkEngine.decisionRecords.find(r => r.threadId === t.id);
      const decisionStatus = decision
        ? (decision.status === 'approved' ? ['RATIFIED BY FOUNDER', 'tag-status-green']
          : decision.status === 'rejected' ? ['REJECTED BY FOUNDER', 'tag-status-amber']
          : decision.status === 'redirected' ? ['REDIRECTED BY FOUNDER', 'tag-status-amber']
          : ['AWAITING FOUNDER', 'tag-status-dim'])
        : ['NOT REQUIRED (INTERNAL WORK)', 'tag-status-dim'];
      const outcomeStatus = t.status === 'completed'
        ? ['RECORDED WITH EVIDENCE', 'tag-status-green']
        : t.status === 'rejected'
          ? ['NOT EXECUTED — REJECTED', 'tag-status-amber']
          : ['NOT YET RECORDED', 'tag-status-dim'];
      auditTableBody.innerHTML = `
        <tr><td><span class="tag-source">SOURCE</span></td><td>${t.evidence.sources} sources gathered for review</td><td><span class="tag-status-green">GATHERED</span></td></tr>
        <tr><td><span class="tag-source">SIGNAL</span></td><td>Relevant changes detected for ${escapeHtml(t.title.toLowerCase())}</td><td><span class="tag-status-green">DETECTED</span></td></tr>
        <tr><td><span class="tag-source">CLAIM</span></td><td>${t.evidence.pending} pending claim${t.evidence.pending === 1 ? '' : 's'} from findings</td><td><span class="tag-status-amber">${t.evidence.pending > 0 ? 'PENDING VERIFICATION' : 'NONE'}</span></td></tr>
        <tr><td><span class="tag-source">FACT</span></td><td>${t.evidence.verified} verified finding${t.evidence.verified === 1 ? '' : 's'}</td><td><span class="tag-status-green">VERIFIED</span></td></tr>
        <tr><td><span class="tag-source">DECISION</span></td><td>Founder ratification boundary${decision ? ': ' + escapeHtml(decision.prepared) : ''}</td><td><span class="${decisionStatus[1]}">${decisionStatus[0]}</span></td></tr>
        <tr><td><span class="tag-source">OUTCOME</span></td><td>${escapeHtml(t.title)} result with evidence attached</td><td><span class="${outcomeStatus[1]}">${outcomeStatus[0]}</span></td></tr>`;
    } else {
      auditScopeLine.textContent = 'Illustrative provenance chain for demo work. Start work to populate this surface.';
      auditTableBody.innerHTML = `
        <tr><td><span class="tag-source">SOURCE</span></td><td>—</td><td><span class="tag-status-dim">NO WORK IN CONTEXT</span></td></tr>
        <tr><td><span class="tag-source">SIGNAL</span></td><td>—</td><td><span class="tag-status-dim">—</span></td></tr>
        <tr><td><span class="tag-source">CLAIM</span></td><td>—</td><td><span class="tag-status-dim">—</span></td></tr>
        <tr><td><span class="tag-source">FACT</span></td><td>—</td><td><span class="tag-status-dim">—</span></td></tr>
        <tr><td><span class="tag-source">DECISION</span></td><td>—</td><td><span class="tag-status-dim">—</span></td></tr>
        <tr><td><span class="tag-source">OUTCOME</span></td><td>—</td><td><span class="tag-status-dim">—</span></td></tr>`;
    }
    auditModal.classList.add('open');
    auditModal.setAttribute('aria-hidden', 'false');
  }

  function closeProvenance() {
    auditModal.classList.remove('open');
    auditModal.setAttribute('aria-hidden', 'true');
  }

  // ========================================================================
  // 12. CORE STATE (internal 7-state machine drives visuals)
  // ========================================================================
  function setCoreState(stateKey, notifyUser) {
    const notify = notifyUser === undefined ? true : notifyUser;
    if (!CORE_STATES[stateKey]) return;
    currentState = stateKey;

    Object.keys(CORE_STATES).forEach(s => body.classList.remove('state-' + s));
    body.classList.add('state-' + stateKey);

    const meta = CORE_STATES[stateKey];
    if (coreStatusLabel) coreStatusLabel.textContent = meta.label;
    if (coreHeadline) coreHeadline.textContent = meta.headline;
    if (coreTagline) coreTagline.textContent = meta.tagline;

    if (notify) showToast(`Core: ${stateKey.replace(/_/g, ' ')}`);
  }

  // ========================================================================
  // 13. MODES (Jarvis / Manual) + AI CREDITS
  // ========================================================================
  function setOperatingMode(mode) {
    currentMode = mode;
    if (mode === 'jarvis') {
      body.classList.remove('mode-manual');
      body.classList.add('mode-jarvis');
      btnJarvisMode.classList.add('active');
      btnManualMode.classList.remove('active');
      if (commandInput) commandInput.placeholder = creditsAvailable ? 'What do you need?' : 'AI credits depleted — Manual mode available';
      showToast('JARVIS mode: natural-language intent. (Jarvis is a mode — the OS stays the same.)');
    } else {
      body.classList.remove('mode-jarvis');
      body.classList.add('mode-manual');
      btnManualMode.classList.add('active');
      btnJarvisMode.classList.remove('active');
      showToast('MANUAL mode: direct module navigation, no AI mediation required.');
    }
  }

  function toggleAICredits() {
    creditsAvailable = !creditsAvailable;
    if (!creditsAvailable) {
      body.classList.remove('credits-available');
      body.classList.add('credits-depleted');
      creditsVal.textContent = 'AI Credits · Depleted';
      showToast('AI credits depleted (simulation). Jarvis is paused — the OS remains fully usable in MANUAL.');
    } else {
      body.classList.remove('credits-depleted');
      body.classList.add('credits-available');
      creditsVal.textContent = 'AI Credits · Available';
      showToast('AI credits restored (simulation). Jarvis assistance is available again.');
    }
  }

  // ========================================================================
  // 14. SHEETS / DRAWERS / MODALS (with mutual exclusion)
  // ========================================================================
  function closeAllSheets() {
    [sheetCompanyState, sheetActivity, sheetDecisions, sheetWork].forEach(s => {
      s.classList.remove('open');
      s.setAttribute('aria-hidden', 'true');
    });
    workforceDrawer.classList.remove('open');
    workforceDrawer.setAttribute('aria-hidden', 'true');
    messengerDrawer.classList.remove('open');
    messengerDrawer.setAttribute('aria-hidden', 'true');
    closeProvenance();
    closeSteering();
  }

  function toggleSheet(sheet, forceOpen) {
    const shouldOpen = forceOpen !== undefined ? forceOpen : !sheet.classList.contains('open');
    if (shouldOpen) closeAllSheets();
    sheet.classList.toggle('open', shouldOpen);
    sheet.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }

  function toggleCompanyState(forceOpen) { toggleSheet(sheetCompanyState, forceOpen); }
  function toggleActivitySheet(forceOpen) { toggleSheet(sheetActivity, forceOpen); }
  function toggleDecisionsSheet(forceOpen) { toggleSheet(sheetDecisions, forceOpen); }
  function toggleWorkSheet(forceOpen) { toggleSheet(sheetWork, forceOpen); }
  function toggleWorkforce(forceOpen) {
    const shouldOpen = forceOpen !== undefined ? forceOpen : !workforceDrawer.classList.contains('open');
    if (shouldOpen) closeAllSheets();
    workforceDrawer.classList.toggle('open', shouldOpen);
    workforceDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  function toggleMessenger() {
    const shouldOpen = !messengerDrawer.classList.contains('open');
    if (shouldOpen) closeAllSheets();
    messengerDrawer.classList.toggle('open', shouldOpen);
    messengerDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }

  // ========================================================================
  // 15. STEERING COMPOSER (conversational steering)
  // ========================================================================
  let steeringTargetId = null;

  function openSteering(threadId) {
    const t = WorkEngine.threadById(threadId || WorkEngine.activeId);
    if (!t) { showToast('No active work to steer. Start something first.'); return; }
    steeringTargetId = t.id;
    steeringComposerTitle.textContent = `Steer — ${t.title}`;
    steeringComposer.classList.add('open');
    steeringComposer.setAttribute('aria-hidden', 'false');
    setTimeout(() => steeringInput.focus(), 120);
  }

  function closeSteering() {
    if (!steeringComposer) return;
    steeringComposer.classList.remove('open');
    steeringComposer.setAttribute('aria-hidden', 'true');
    steeringInput.value = '';
  }

  function submitSteering(text) {
    const clean = (text || '').trim();
    if (!clean) { showToast('Write an instruction for Core, or pick an example.'); return; }
    const t = WorkEngine.threadById(steeringTargetId);
    closeSteering();
    if (!t) { showToast('That work is no longer active.'); return; }
    WorkEngine.steerThread(t, clean);
    focusThread(t.id, { silent: true });
  }

  // ========================================================================
  // 16. COMMAND ROUTING (intent → understanding → work; interruption)
  // ========================================================================
  let interruptTimer = null;

  function runCommand(commandText) {
    if (!commandText || !commandText.trim()) return;
    const cleanCmd = commandText.trim();
    commandInput.value = '';

    if (!creditsAvailable) {
      showToast('Jarvis is paused (AI credits depleted). Switch to MANUAL or restore credits.');
      return;
    }

    const lower = cleanCmd.toLowerCase();

    // --- STOP commands: interrupt without creating new work ---
    if (/^(stop|halt|cancel)\b/.test(lower)) {
      const active = WorkEngine.activeThread();
      if (active) {
        WorkEngine.stopThread(active, 'Founder said stop.');
        setCoreState('ready', false);
        showToast(`Stopped \u201C${active.title}\u201D (simulation). The thread stays below for inspection.`);
        renderAll();
      } else {
        showToast('Nothing is running.');
      }
      return;
    }

    // --- ATTENTION routing ---
    if (/attention|needs? me|what matters/i.test(lower)) {
      onWhatMattersClick();
      return;
    }

    // --- CONTINUE routing: resume or re-open an existing thread ---
    if (/^continue|resume/i.test(lower)) {
      const match = findContinueMatch(lower);
      if (match) {
        if (match.status === 'paused') {
          WorkEngine.resumeThread(match);
          showToast(`Continuing \u201C${match.title}\u201D (simulation).`);
        } else {
          focusThread(match.id);
          showToast(`Reopened \u201C${match.title}\u201D (simulation).`);
        }
        return;
      }
      // no match — fall through to create new work
    }

    // --- NEW WORK ---
    const active = WorkEngine.activeThread();
    if (active && (active.status === 'researching' || active.status === 'executing')) {
      // FOUNDER INTERRUPTION: redirect the active thread
      interruptActiveWork(active, cleanCmd);
      return;
    }

    startUnderstanding(cleanCmd);
  }

  function findContinueMatch(lower) {
    // match by template keywords
    const tpl = WORK_TEMPLATES.find(t => t.match.test(lower));
    if (tpl) {
      const found = WorkEngine.threads.filter(t => t.title === tpl.title);
      if (found.length) {
        // prefer resumable: paused > stopped > completed
        return found.find(t => t.status === 'paused') || found.find(t => t.status === 'stopped') || found[found.length - 1];
      }
    }
    return null;
  }

  function interruptActiveWork(activeThread, newCommand) {
    // Show WORK UPDATED: previous direction → new founder direction → redirecting
    WorkEngine.clearTimers(activeThread.id);
    activeThread.status = 'redirected';
    activeThread.redirectedFrom = activeThread.title;

    interruptPrevDirection.textContent = activeThread.title;
    interruptNewDirection.textContent = newCommand;

    setCoreState('understanding', false);
    body.classList.add('interrupting');
    if (coreTagline) coreTagline.textContent = 'Redirecting — your new direction takes priority';

    addActivity(`Founder redirected work: \u201C${activeThread.title}\u201D → new direction`, 'steer');
    showToast('Founder interruption (simulation) — redirecting Core…');
    renderAll();

    if (interruptTimer) clearTimeout(interruptTimer);
    interruptTimer = setTimeout(() => {
      body.classList.remove('interrupting');
      startUnderstanding(newCommand);
    }, 2100);
  }

  function startUnderstanding(commandText) {
    if (interruptTimer) { clearTimeout(interruptTimer); interruptTimer = null; }
    body.classList.remove('interrupting');

    // Build the thread immediately (status researching, no timers yet)
    const thread = WorkEngine.createThread(commandText);

    // Layer 1: show what was asked and what Core understands
    intentQuoteDisplay.textContent = `\u201C${commandText}\u201D`;
    understandingTitle.textContent = thread.title;
    understandingDesc.textContent = thread.desc;
    understandingContextChips.innerHTML = thread.chips.map(c => `<span class="context-chip"><span class="chip-dot"></span> ${escapeHtml(c)}</span>`).join('');

    setCoreState('understanding', false);
    showToast(`Core understands: ${thread.title}`);
    WorkEngine.activeId = thread.id;
    renderAll();

    // Understanding → work begins
    WorkEngine.clearTimers(thread.id);
    WorkEngine.timers[thread.id] = setTimeout(() => {
      addActivity(`Work started: ${thread.title}`, 'work');
      WorkEngine.startProgress(thread);
      setCoreState('working', false);
      focusThread(thread.id, { silent: true });
    }, 1800);
  }

  // ========================================================================
  // 17. GLOBAL RENDER
  // ========================================================================
  function renderAll() {
    renderAttention();
    renderDock();
    renderDecisionsSheet();
    renderWorkSheet();

    const active = WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null;
    if (active) {
      if (active.status === 'researching' || active.status === 'executing' || active.status === 'paused') {
        renderActiveSheet(active);
      } else if (active.status === 'awaiting') {
        renderDecisionPane(active);
      } else if (active.status === 'completed' || active.status === 'rejected') {
        renderOutcomePane(active);
      }
    }
  }

  // ========================================================================
  // 18. EVENT BINDINGS
  // ========================================================================
  function bindEvents() {
    // Modes
    btnJarvisMode.addEventListener('click', () => setOperatingMode('jarvis'));
    btnManualMode.addEventListener('click', () => setOperatingMode('manual'));

    // Credits
    btnToggleCredits.addEventListener('click', toggleAICredits);
    btnRestoreCredits.addEventListener('click', () => {
      if (!creditsAvailable) toggleAICredits();
    });

    // Atmosphere
    btnAtmosphereToggle.addEventListener('click', () => {
      body.classList.toggle('atmosphere-bright');
      showToast(body.classList.contains('atmosphere-bright') ? 'Lighting: High Contrast' : 'Lighting: Cinematic Obsidian');
    });

    // Core click: when ready, focus the command input ("What do you need?")
    coreCanvas.addEventListener('click', () => {
      if (currentState === 'ready' && currentMode === 'jarvis') commandInput.focus();
    });

    // Command form
    commandForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runCommand(commandInput.value);
    });

    // Prompt chips
    suggestedPromptsRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.prompt-chip');
      if (chip && chip.dataset.prompt) runCommand(chip.dataset.prompt);
    });

    // What matters strip
    whatMattersStrip.addEventListener('click', onWhatMattersClick);

    // Active work controls
    btnWorkSteer.addEventListener('click', () => openSteering(WorkEngine.activeId));
    btnWorkPause.addEventListener('click', () => {
      const t = WorkEngine.activeThread() || (WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null);
      if (!t) return;
      if (t.status === 'paused') { WorkEngine.resumeThread(t); focusThread(t.id, { silent: true }); }
      else if (t.status === 'researching') { WorkEngine.pauseThread(t); renderAll(); }
    });
    btnWorkStop.addEventListener('click', () => {
      const t = WorkEngine.activeThread();
      if (!t) return;
      WorkEngine.stopThread(t, 'Stopped by founder.');
      setCoreState('ready', false);
      showToast(`Stopped \u201C${t.title}\u201D (simulation). The thread stays below.`);
      renderAll();
    });

    // Decision actions
    btnDecisionApprove.addEventListener('click', () => {
      const t = WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null;
      if (t && t.status === 'awaiting') {
        WorkEngine.decide(t.id, 'approve');
        focusThread(t.id, { silent: true });
        showToast('Approved (simulation). Core is executing the authorized action…');
      }
    });
    btnDecisionReject.addEventListener('click', () => {
      const t = WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null;
      if (t && t.status === 'awaiting') {
        WorkEngine.decide(t.id, 'reject');
        focusThread(t.id, { silent: true });
      }
    });
    btnDecisionRedirect.addEventListener('click', () => openSteering(WorkEngine.activeId));
    btnDecisionInspect.addEventListener('click', () => openProvenance(WorkEngine.activeId));

    // Outcome actions
    btnOutcomeReview.addEventListener('click', () => {
      const t = WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null;
      showToast(t ? `Result (simulation): ${t.outcomeShown || t.outcome}` : 'No result in context.');
    });
    btnOutcomeEvidence.addEventListener('click', () => openProvenance(WorkEngine.activeId));
    btnOutcomeProvenance.addEventListener('click', () => openProvenance(WorkEngine.activeId));
    btnOutcomeContinue.addEventListener('click', () => {
      // Continue work: resume completed/rejected thread as a fresh cycle
      const t = WorkEngine.activeId ? WorkEngine.threadById(WorkEngine.activeId) : null;
      if (!t) return;
      if (t.status === 'completed' || t.status === 'rejected' || t.status === 'stopped') {
        t.status = 'researching';
        t.steps = t.steps.map(s => ({ ...s, state: 'pending' }));
        t.outcomeShown = null;
        addActivity(`Continued by founder: ${t.title}`, 'work');
        WorkEngine.startProgress(t);
        setCoreState('working', false);
        focusThread(t.id, { silent: true });
        showToast(`Continuing \u201C${t.title}\u201D (simulation).`);
      } else if (t.status === 'paused') {
        WorkEngine.resumeThread(t);
        focusThread(t.id, { silent: true });
      }
    });

    // Blocked pane
    btnBlockedSteer.addEventListener('click', () => openSteering(WorkEngine.activeId));
    btnDismissBlocked.addEventListener('click', () => {
      setCoreState('ready', false);
      showToast('Acknowledged. Core is ready for your next intent.');
    });

    // Steering composer
    btnCloseSteering.addEventListener('click', closeSteering);
    steeringForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSteering(steeringInput.value);
    });
    document.querySelectorAll('.steering-example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        submitSteering(chip.dataset.example);
      });
    });

    // Dock interactions (event delegation)
    dockThreadsRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.thread-btn');
      const card = e.target.closest('.thread-card');
      if (!card) return;
      const id = card.dataset.thread;
      if (btn) {
        const action = btn.dataset.action;
        const t = WorkEngine.threadById(id);
        if (!t) return;
        if (action === 'stop') {
          WorkEngine.stopThread(t, 'Stopped by founder.');
          setCoreState('ready', false);
          showToast(`Stopped \u201C${t.title}\u201D (simulation).`);
        } else if (action === 'pause') {
          WorkEngine.pauseThread(t);
        } else if (action === 'resume') {
          WorkEngine.resumeThread(t);
          focusThread(id, { silent: true });
        } else if (action === 'focus') {
          focusThread(id);
        }
        renderAll();
        return;
      }
      focusThread(id);
    });

    // Decisions sheet (event delegation)
    decisionsList.addEventListener('click', (e) => {
      const card = e.target.closest('.decision-record-card');
      if (!card) return;
      const rec = WorkEngine.decisionRecords.find(r => r.id === card.dataset.decision);
      if (!rec) return;
      if (rec.status === 'pending') {
        toggleDecisionsSheet(false);
        focusThread(rec.threadId);
      } else {
        openProvenance(rec.threadId);
      }
    });

    // Work sheet (event delegation)
    workSheetList.addEventListener('click', (e) => {
      const btn = e.target.closest('.ws-btn');
      if (!btn) return;
      const id = btn.dataset.thread;
      if (btn.dataset.sheetAction === 'focus') {
        toggleWorkSheet(false);
        setOperatingMode('jarvis');
        focusThread(id);
      }
    });

    // Satellites
    beaconCompanyState.addEventListener('click', () => toggleCompanyState());
    beaconWorkforce.addEventListener('click', () => toggleWorkforce());
    beaconDecisions.addEventListener('click', () => toggleDecisionsSheet());
    beaconActivity.addEventListener('click', () => toggleActivitySheet());

    $('btnCloseCompanyState').addEventListener('click', () => toggleCompanyState(false));
    $('btnCloseActivity').addEventListener('click', () => toggleActivitySheet(false));
    $('btnCloseDecisions').addEventListener('click', () => toggleDecisionsSheet(false));
    $('btnCloseSheetWork').addEventListener('click', () => toggleWorkSheet(false));
    $('btnCloseWorkforce').addEventListener('click', () => toggleWorkforce(false));
    $('btnCloseAudit').addEventListener('click', closeProvenance);
    $('btnViewAllActivity').addEventListener('click', () => openProvenance());
    auditModal.addEventListener('click', (e) => {
      if (e.target === auditModal) closeProvenance();
    });

    // Messenger
    btnOpenMessenger.addEventListener('click', toggleMessenger);
    btnCloseMessenger.addEventListener('click', toggleMessenger);
    messengerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = messengerInput.value.trim();
      if (!val) return;
      messengerInput.value = '';
      const userBubble = document.createElement('div');
      userBubble.className = 'msg-bubble msg-user';
      userBubble.textContent = val;
      messengerMessages.appendChild(userBubble);
      messengerMessages.scrollTop = messengerMessages.scrollHeight;
      setTimeout(() => {
        addMessengerMessage('Sophia', 'Understood (simulated). In production, this reaches the governed communication layer — no live channel is connected here.');
      }, 900);
    });

    // Manual mode module cards — every module reachable without Jarvis
    cardManualCompany.addEventListener('click', () => toggleCompanyState(true));
    cardManualWork.addEventListener('click', () => toggleWorkSheet(true));
    cardManualDecisions.addEventListener('click', () => toggleDecisionsSheet(true));
    cardManualResearch.addEventListener('click', () => openProvenance());
    cardManualWorkforce.addEventListener('click', () => toggleWorkforce(true));
    cardManualActivity.addEventListener('click', () => toggleActivitySheet(true));
    cardManualAudit.addEventListener('click', () => openProvenance());
    cardManualMessenger.addEventListener('click', toggleMessenger);

    // Reset demo
    btnResetDemo.addEventListener('click', resetDemo);

    // Global keys
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllSheets();
        body.classList.remove('interrupting');
        return;
      }
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'c' || e.key === 'C') toggleCompanyState();
      if (e.key === 'w' || e.key === 'W') toggleWorkforce();
      if (e.key === 'a' || e.key === 'A') toggleActivitySheet();
      if (e.key === 'd' || e.key === 'D') toggleDecisionsSheet();
      if (e.key === 'm' || e.key === 'M') toggleMessenger();
    });
  }

  function resetDemo() {
    WorkEngine.reset();
    activityEvents = [];
    addActivity('Core prototype initialized — demo state', 'info');
    messengerMessages.innerHTML = `
      <div class="msg-bubble msg-agent">
        <div class="msg-sender">Core</div>
        <div class="msg-content">Messenger is a communication layer, not a dashboard. Messages here are simulated for the prototype.</div>
      </div>`;
    body.classList.remove('interrupting');
    setCoreState('ready', false);
    renderAll();
    showToast('Simulation reset. No live data was affected.');
  }

  // ========================================================================
  // 19. INITIALIZATION
  // ========================================================================
  function init() {
    initStarfield();
    initEarthHorizon();
    initCoreParticles();
    bindEvents();
    updateClock();
    setInterval(updateClock, 30000);
    addActivity('Core prototype initialized — demo state', 'info');
    renderAll();
    requestAnimationFrame(renderLoop);
    window.__v4 = { WorkEngine, setCoreState, renderAll, runCommand, startUnderstanding, onWhatMattersClick };
  }

  window.addEventListener('DOMContentLoaded', init);

})();
