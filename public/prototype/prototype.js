/**
 * ==========================================================================
 * SAMJUNIORS OS — CORE V3 PROTOTYPE SCRIPT
 * Living Intelligence Field · Astra-Inspired Steering · 7 Core Operational States
 * ==========================================================================
 */

(function () {
  'use strict';

  // --- 1. NEW 7-STATE CORE OPERATIONAL MODEL ---
  const CORE_STATES = {
    ready: {
      label: "I'm ready.",
      headline: "SAMJUNIORS CORE",
      tagline: "I'm ready. What would you like to do?",
      contextHeader: "FOUNDER COMMAND",
      waveSpeed: 0.02,
      waveAmp: 5,
      color: '#00E5FF',
      secondaryColor: '#8B5CF6'
    },
    understanding: {
      label: "Understanding intent & gathering context...",
      headline: "UNDERSTANDING YOUR INTENT",
      tagline: "ANALYZING CONTEXT · CROSS-REFERENCING GOVERNED MEMORY",
      contextHeader: "CONTEXT GATHERING",
      waveSpeed: 0.05,
      waveAmp: 12,
      color: '#38BDF8',
      secondaryColor: '#6366F1'
    },
    working: {
      label: "Working on task: synthesizing data & drafting steps...",
      headline: "WORKING ON TASK",
      tagline: "EXECUTING WORKFLOW · TRANSPARENT STEPS IN PROGRESS",
      contextHeader: "COMPANY OPERATIONS",
      waveSpeed: 0.06,
      waveAmp: 16,
      color: '#A855F7',
      secondaryColor: '#00E5FF'
    },
    waiting_for_founder: {
      label: "Founder attention required · Consequential decision gate",
      headline: "FOUNDER ATTENTION",
      tagline: "A DECISION REQUIRES YOUR JUDGMENT TO PROCEED",
      contextHeader: "DECISION GATE",
      waveSpeed: 0.02,
      waveAmp: 6,
      color: '#F59E0B',
      secondaryColor: '#F43F5E'
    },
    executing: {
      label: "Executing governed step in deterministic sandbox...",
      headline: "EXECUTING",
      tagline: "DETERMINISTIC VERIFICATION & GOVERNED PASS ACTIVE",
      contextHeader: "SANDBOX EXECUTION",
      waveSpeed: 0.08,
      waveAmp: 18,
      color: '#10B981',
      secondaryColor: '#00E5FF'
    },
    completed: {
      label: "Task completed · Durable record committed",
      headline: "COMPLETED",
      tagline: "RESULT PREPARED · AUDIT TRAIL PRESERVED",
      contextHeader: "TASK COMPLETED",
      waveSpeed: 0.02,
      waveAmp: 4,
      color: '#10B981',
      secondaryColor: '#34D399'
    },
    blocked: {
      label: "Execution blocked: Invariant boundary reached",
      headline: "BLOCKED",
      tagline: "CONSTITUTIONAL SAFETY CHECK HALTED ACTION",
      contextHeader: "EXCEPTION DIAGNOSTIC",
      waveSpeed: 0.015,
      waveAmp: 3,
      color: '#F43F5E',
      secondaryColor: '#991B1B'
    }
  };

  let currentState = 'ready';
  let currentMode = 'jarvis';
  let creditsAvailable = true;
  let activeTaskTitle = "Company Review Preparation";
  let simulationTimer = null;

  // --- DOM REFERENCES ---
  const body = document.body;
  const coreHeadline = document.getElementById('coreHeadline');
  const coreTagline = document.getElementById('coreTagline');
  const coreStatusLabel = document.getElementById('coreStatusLabel');
  const headerContextText = document.getElementById('headerContextText');
  const toastNotification = document.getElementById('toastNotification');
  const clockDisplay = document.getElementById('clockDisplay');

  // Mode Buttons
  const btnJarvisMode = document.getElementById('btnJarvisMode');
  const btnManualMode = document.getElementById('btnManualMode');

  // Credits
  const btnToggleCredits = document.getElementById('btnToggleCredits');
  const creditsVal = document.getElementById('creditsVal');
  const jarvisUnavailableBanner = document.getElementById('jarvisUnavailableBanner');
  const btnRestoreCredits = document.getElementById('btnRestoreCredits');

  // Atmosphere
  const btnAtmosphereToggle = document.getElementById('btnAtmosphereToggle');

  // Command & Input
  const commandForm = document.getElementById('commandForm');
  const commandInput = document.getElementById('commandInput');
  const suggestedPromptsRow = document.getElementById('suggestedPromptsRow');

  // Work Surface Elements
  const coreWorkSurface = document.getElementById('coreWorkSurface');
  const intentQuoteDisplay = document.getElementById('intentQuoteDisplay');
  const workingTaskName = document.getElementById('workingTaskName');
  const btnSteeringRedirect = document.getElementById('btnSteeringRedirect');
  const btnSteeringStop = document.getElementById('btnSteeringStop');
  const btnExecutingStop = document.getElementById('btnExecutingStop');
  const steeringPopover = document.getElementById('steeringPopover');
  const btnCloseSteering = document.getElementById('btnCloseSteering');

  // Decision Elements
  const btnDecisionApprove = document.getElementById('btnDecisionApprove');
  const btnDecisionReject = document.getElementById('btnDecisionReject');
  const btnDismissBlocked = document.getElementById('btnDismissBlocked');
  const btnCompletedDismiss = document.getElementById('btnCompletedDismiss');
  const btnCompletedAction1 = document.getElementById('btnCompletedAction1');
  const btnCompletedAction2 = document.getElementById('btnCompletedAction2');

  // Satellites
  const beaconCompanyState = document.getElementById('beaconCompanyState');
  const beaconWorkforce = document.getElementById('beaconWorkforce');
  const beaconAttention = document.getElementById('beaconAttention');
  const beaconActivity = document.getElementById('beaconActivity');

  // Contextual Sheets & Modals
  const sheetCompanyState = document.getElementById('sheetCompanyState');
  const btnCloseCompanyState = document.getElementById('btnCloseCompanyState');
  const sheetActivity = document.getElementById('sheetActivity');
  const btnCloseActivity = document.getElementById('btnCloseActivity');
  const workforceDrawer = document.getElementById('workforceDrawer');
  const btnCloseWorkforce = document.getElementById('btnCloseWorkforce');
  const auditModal = document.getElementById('auditModal');
  const btnViewAllActivity = document.getElementById('btnViewAllActivity');
  const btnCloseAudit = document.getElementById('btnCloseAudit');

  // Messenger
  const messengerDrawer = document.getElementById('messengerDrawer');
  const btnOpenMessenger = document.getElementById('btnOpenMessenger');
  const btnCloseMessenger = document.getElementById('btnCloseMessenger');
  const messengerForm = document.getElementById('messengerForm');
  const messengerInput = document.getElementById('messengerInput');
  const messengerMessages = document.getElementById('messengerMessages');

  // Manual Mode Direct Cards
  const cardManualCompany = document.getElementById('cardManualCompany');
  const cardManualWork = document.getElementById('cardManualWork');
  const cardManualDecisions = document.getElementById('cardManualDecisions');
  const cardManualResearch = document.getElementById('cardManualResearch');
  const cardManualWorkforce = document.getElementById('cardManualWorkforce');
  const cardManualActivity = document.getElementById('cardManualActivity');
  const cardManualAudit = document.getElementById('cardManualAudit');

  // State Test Toolbar
  const stateChips = document.querySelectorAll('.state-chip');

  // --- 2. PROCEDURAL STARFIELD BACKGROUND ---
  const starCanvas = document.getElementById('starfieldCanvas');
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

  // --- 3. PROCEDURAL CURVED EARTH HORIZON & CITY LIGHTS ---
  const earthCanvas = document.getElementById('earthHorizonCanvas');
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

  // --- 4. PROCEDURAL LIVING INTELLIGENCE CORE (STATE-AWARE PARTICLES) ---
  const coreCanvas = document.getElementById('coreCanvas');
  const coreCtx = coreCanvas ? coreCanvas.getContext('2d') : null;

  // Particle models for the 7 states
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
  initCoreParticles();

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

    // 1. External Glow
    const bloomGrad = coreCtx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    bloomGrad.addColorStop(0, stateMeta.color + '44');
    bloomGrad.addColorStop(0.5, stateMeta.secondaryColor + '18');
    bloomGrad.addColorStop(1, 'transparent');
    coreCtx.fillStyle = bloomGrad;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
    coreCtx.fill();

    // 2. 3D Body Shading
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

    // 3. Iridescent Rim
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

    // 4. Living Particle Field Behavior (Specific to State)
    for (let p of coreParticles) {
      let px = cx;
      let py = cy;

      if (currentState === 'ready') {
        // Slow calm breathing orbit
        const angle = p.baseAngle + time * (p.speed * 0.8);
        const dist = (p.dist * 0.7) * (0.8 + 0.2 * Math.sin(time * 0.001 + p.seed));
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.6;
      } else if (currentState === 'understanding') {
        // Particles converge inward toward core center
        const inwardT = (Math.sin(time * 0.002 + p.seed) + 1) * 0.5;
        const dist = 85 * (1 - inwardT * 0.7);
        const angle = p.baseAngle + time * 0.002;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.7;
      } else if (currentState === 'working') {
        // Circulate dynamically around/through Core
        const angle = p.baseAngle + time * (p.speed * 3.0);
        const dist = p.dist * 0.8;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.8;
      } else if (currentState === 'waiting_for_founder') {
        // Activity slows; focused amber concentration
        const angle = p.baseAngle + time * (p.speed * 0.2);
        const dist = 30 + 20 * Math.sin(time * 0.001 + p.seed);
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.9;
      } else if (currentState === 'executing') {
        // Directional, structured movement along horizontal/orbital axes
        const flowX = Math.sin(time * 0.003 + p.seed) * 75;
        const flowY = Math.cos(time * 0.0015 + p.seed) * 25;
        px = cx + flowX;
        py = cy + flowY;
      } else if (currentState === 'completed') {
        // Calm settling glow
        const angle = p.baseAngle + time * 0.0006;
        const dist = p.dist * 0.6;
        px = cx + Math.cos(angle) * dist;
        py = cy + Math.sin(angle) * dist * 0.6;
      } else if (currentState === 'blocked') {
        // Restrained perimeter warning
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

    // 5. Lens Flare Glare
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

  // --- 5. FREQUENCY WAVE ---
  const waveCanvas = document.getElementById('waveCanvas');
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

  // Animation Loop
  function renderLoop(time) {
    drawStarfield(time);
    drawEarthHorizon(time);
    drawLivingCore(time);
    drawFrequencyWave(time);
    requestAnimationFrame(renderLoop);
  }

  // --- 6. STATE MACHINE (7 CORE STATES) ---
  function setCoreState(stateKey, notifyUser = true) {
    if (!CORE_STATES[stateKey]) return;
    currentState = stateKey;

    Object.keys(CORE_STATES).forEach(s => body.classList.remove('state-' + s));
    body.classList.add('state-' + stateKey);

    const meta = CORE_STATES[stateKey];
    if (coreStatusLabel) coreStatusLabel.textContent = meta.label;
    if (coreHeadline) coreHeadline.textContent = meta.headline;
    if (coreTagline) coreTagline.textContent = meta.tagline;
    if (headerContextText) headerContextText.textContent = meta.contextHeader;

    // Update state toolbar
    stateChips.forEach(chip => {
      if (chip.dataset.state === stateKey) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Update Contextual Beacons visibility/appearance based on state
    if (beaconAttention) {
      if (stateKey === 'waiting_for_founder') {
        beaconAttention.style.display = 'flex';
        beaconAttention.classList.add('highlight-attention');
      } else {
        beaconAttention.classList.remove('highlight-attention');
      }
    }

    if (notifyUser) {
      showToast(`Core state: ${stateKey.toUpperCase().replace(/_/g, ' ')}`);
    }
  }

  // --- 7. JARVIS VS MANUAL MODE ---
  function setOperatingMode(mode) {
    currentMode = mode;
    if (mode === 'jarvis') {
      body.classList.remove('mode-manual');
      body.classList.add('mode-jarvis');
      btnJarvisMode.classList.add('active');
      btnManualMode.classList.remove('active');
      if (headerContextText) headerContextText.textContent = "FOUNDER COMMAND";
      commandInput.placeholder = "What would you like Core to work on?";
      showToast("JARVIS Mode: Natural-language company command active.");
    } else {
      body.classList.remove('mode-jarvis');
      body.classList.add('mode-manual');
      btnManualMode.classList.add('active');
      btnJarvisMode.classList.remove('active');
      if (headerContextText) headerContextText.textContent = "GOVERNED SYSTEMS";
      showToast("MANUAL Mode: Direct operational access (Zero AI mediation).");
    }
  }

  // --- 8. AI CREDITS SIMULATION ---
  function toggleAICredits() {
    creditsAvailable = !creditsAvailable;
    if (!creditsAvailable) {
      body.classList.remove('credits-available');
      body.classList.add('credits-depleted');
      creditsVal.textContent = "Credits: 0 (Depleted)";
      showToast("AI capability depleted. Core switches to Manual fallback.");
    } else {
      body.classList.remove('credits-depleted');
      body.classList.add('credits-available');
      creditsVal.textContent = "Credits: 850";
      showToast("AI credits restored. Jarvis assistance available.");
    }
  }

  // --- 9. STEERING & REDIRECT CONTROLS (ASTRA-INSPIRED) ---
  function openSteering() {
    if (steeringPopover) {
      steeringPopover.classList.add('open');
      steeringPopover.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSteering() {
    if (steeringPopover) {
      steeringPopover.classList.remove('open');
      steeringPopover.setAttribute('aria-hidden', 'true');
    }
  }

  function applySteering(steeringType) {
    closeSteering();
    if (simulationTimer) clearTimeout(simulationTimer);

    if (steeringType === 'product') {
      activeTaskTitle = "Product Context Deep Dive";
      if (workingTaskName) workingTaskName.textContent = activeTaskTitle;
      if (headerContextText) headerContextText.textContent = "LUMORA · PRODUCT CONTEXT";
      showToast("Steered work: Core focused on Product context.");
    } else if (steeringType === 'research') {
      activeTaskTitle = "Market Research Signal Synthesis";
      if (workingTaskName) workingTaskName.textContent = activeTaskTitle;
      if (headerContextText) headerContextText.textContent = "RESEARCH & SIGNALS";
      showToast("Steered work: Core focused on Market Research.");
    } else if (steeringType === 'findings') {
      setCoreState('completed');
      showToast("Core paused: Showing findings accumulated so far.");
      return;
    } else if (steeringType === 'new_directive') {
      setCoreState('ready');
      commandInput.focus();
      showToast("Core reset: Ready for new instruction.");
      return;
    }

    // Continue working with updated focus
    setCoreState('working', false);
    simulationTimer = setTimeout(() => {
      setCoreState('waiting_for_founder', false);
      showToast("Steered task reached Decision Gate.");
    }, 2400);
  }

  function stopOngoingWork() {
    if (simulationTimer) clearTimeout(simulationTimer);
    closeSteering();
    setCoreState('ready', false);
    showToast("Ongoing work halted by Founder. Core returned to Ready.");
  }

  // --- 10. COMMAND EXECUTION LIFECYCLE SIMULATION ---
  function runCommandSimulation(commandText) {
    if (!commandText || commandText.trim() === '') return;
    const cleanCmd = commandText.trim();
    commandInput.value = '';

    if (!creditsAvailable) {
      showToast("Cannot run Jarvis command: AI Credits depleted. Use Manual mode.");
      return;
    }

    if (simulationTimer) clearTimeout(simulationTimer);

    // Contextual direct navigation check
    const lower = cleanCmd.toLowerCase();
    if (lower.includes('status') || lower.includes('company')) {
      toggleCompanyState(true);
      return;
    }
    if (lower.includes('workforce') || lower.includes('sophia') || lower.includes('thorne')) {
      toggleWorkforce(true);
      return;
    }

    activeTaskTitle = cleanCmd;
    if (intentQuoteDisplay) intentQuoteDisplay.textContent = `"${cleanCmd}"`;
    if (workingTaskName) workingTaskName.textContent = cleanCmd;

    showToast(`Intent captured: "${cleanCmd}"`);
    setCoreState('understanding', false);

    // 1. Understanding -> Working (1.4s)
    simulationTimer = setTimeout(() => {
      setCoreState('working', false);
      showToast("Core working: Evaluating company context & signals...");

      // 2. Working -> Waiting for Founder (3.0s)
      simulationTimer = setTimeout(() => {
        setCoreState('waiting_for_founder', false);
        showToast("Consequential Decision Gate reached: Founder Attention Required.");
      }, 3000);

    }, 1400);
  }

  // --- 11. CONTEXTUAL SHEETS & MODALS ---
  function toggleCompanyState(forceOpen) {
    const shouldOpen = forceOpen !== undefined ? forceOpen : !sheetCompanyState.classList.contains('open');
    if (shouldOpen) {
      sheetCompanyState.classList.add('open');
      sheetCompanyState.setAttribute('aria-hidden', 'false');
      sheetActivity.classList.remove('open');
    } else {
      sheetCompanyState.classList.remove('open');
      sheetCompanyState.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleActivitySheet(forceOpen) {
    const shouldOpen = forceOpen !== undefined ? forceOpen : !sheetActivity.classList.contains('open');
    if (shouldOpen) {
      sheetActivity.classList.add('open');
      sheetActivity.setAttribute('aria-hidden', 'false');
      sheetCompanyState.classList.remove('open');
    } else {
      sheetActivity.classList.remove('open');
      sheetActivity.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleWorkforce(forceOpen) {
    const shouldOpen = forceOpen !== undefined ? forceOpen : !workforceDrawer.classList.contains('open');
    if (shouldOpen) {
      workforceDrawer.classList.add('open');
      workforceDrawer.setAttribute('aria-hidden', 'false');
    } else {
      workforceDrawer.classList.remove('open');
      workforceDrawer.setAttribute('aria-hidden', 'true');
    }
  }

  function openAuditModal() {
    auditModal.classList.add('open');
    auditModal.setAttribute('aria-hidden', 'false');
  }

  function closeAuditModal() {
    auditModal.classList.remove('open');
    auditModal.setAttribute('aria-hidden', 'true');
  }

  function toggleMessenger() {
    const isOpen = messengerDrawer.classList.contains('open');
    if (isOpen) {
      messengerDrawer.classList.remove('open');
      messengerDrawer.setAttribute('aria-hidden', 'true');
    } else {
      messengerDrawer.classList.add('open');
      messengerDrawer.setAttribute('aria-hidden', 'false');
      messengerInput.focus();
    }
  }

  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 3200);
  }

  // --- 12. REAL-TIME CLOCK ---
  function updateClock() {
    if (!clockDisplay) return;
    const now = new Date();
    const dateOpts = { weekday: 'short', month: 'short', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', dateOpts);
    const timeStr = now.toTimeString().substring(0, 5);

    const dateSpan = clockDisplay.querySelector('.clock-date');
    const timeSpan = clockDisplay.querySelector('.clock-time');
    if (dateSpan) dateSpan.textContent = dateStr;
    if (timeSpan) timeSpan.textContent = timeStr;
  }

  // --- 13. EVENT BINDINGS ---
  function bindEvents() {
    // Mode toggles
    btnJarvisMode.addEventListener('click', () => setOperatingMode('jarvis'));
    btnManualMode.addEventListener('click', () => setOperatingMode('manual'));

    // AI Credits
    btnToggleCredits.addEventListener('click', toggleAICredits);
    btnRestoreCredits.addEventListener('click', () => {
      toggleAICredits();
      setOperatingMode('jarvis');
    });

    // Atmosphere
    btnAtmosphereToggle.addEventListener('click', () => {
      body.classList.toggle('atmosphere-bright');
      showToast(body.classList.contains('atmosphere-bright') ? "Lighting: High Contrast" : "Lighting: Cinematic Obsidian");
    });

    // Core Canvas click cycles core state
    coreCanvas.addEventListener('click', () => {
      if (currentState === 'ready') setCoreState('understanding');
      else if (currentState === 'understanding') setCoreState('working');
      else if (currentState === 'working') setCoreState('waiting_for_founder');
      else setCoreState('ready');
    });

    // Satellites
    beaconCompanyState.addEventListener('click', () => toggleCompanyState());
    btnCloseCompanyState.addEventListener('click', () => toggleCompanyState(false));

    beaconWorkforce.addEventListener('click', () => toggleWorkforce());
    btnCloseWorkforce.addEventListener('click', () => toggleWorkforce(false));

    beaconAttention.addEventListener('click', () => {
      setCoreState('waiting_for_founder');
    });

    beaconActivity.addEventListener('click', () => toggleActivitySheet());
    btnCloseActivity.addEventListener('click', () => toggleActivitySheet(false));

    // Steering Buttons
    btnSteeringRedirect.addEventListener('click', openSteering);
    btnSteeringStop.addEventListener('click', stopOngoingWork);
    btnExecutingStop.addEventListener('click', stopOngoingWork);
    btnCloseSteering.addEventListener('click', closeSteering);

    document.querySelectorAll('.steering-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applySteering(btn.dataset.steering);
      });
    });

    // Decision Actions
    btnDecisionApprove.addEventListener('click', () => {
      setCoreState('executing', false);
      showToast("Founder signature recorded. Executing ratified step...");

      simulationTimer = setTimeout(() => {
        setCoreState('completed');
        showToast("Consequential action executed and committed to audit store.");
      }, 2000);
    });

    btnDecisionReject.addEventListener('click', () => {
      setCoreState('ready');
      showToast("Action rejected by Founder. Core returned to Ready.");
    });

    btnDismissBlocked.addEventListener('click', () => {
      setCoreState('ready');
      showToast("Diagnostic acknowledged. Core returned to Ready.");
    });

    btnCompletedDismiss.addEventListener('click', () => {
      setCoreState('ready');
    });

    btnCompletedAction1.addEventListener('click', () => {
      setCoreState('waiting_for_founder');
    });

    btnCompletedAction2.addEventListener('click', () => {
      openAuditModal();
    });

    // Command Form Submit
    commandForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runCommandSimulation(commandInput.value);
    });

    // Suggested Prompt Chips
    suggestedPromptsRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.prompt-chip');
      if (chip && chip.dataset.prompt) {
        runCommandSimulation(chip.dataset.prompt);
      }
    });

    // Toolbar 7 State Chips
    stateChips.forEach(chip => {
      chip.addEventListener('click', () => {
        setCoreState(chip.dataset.state);
      });
    });

    // Audit Inspector
    btnViewAllActivity.addEventListener('click', openAuditModal);
    btnCloseAudit.addEventListener('click', closeAuditModal);

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
        const agentBubble = document.createElement('div');
        agentBubble.className = 'msg-bubble msg-agent';
        agentBubble.innerHTML = `
          <div class="msg-sender">Sophia (COO)</div>
          <div class="msg-content">Understood, Sam. Core state is tracking this directive.</div>
        `;
        messengerMessages.appendChild(agentBubble);
        messengerMessages.scrollTop = messengerMessages.scrollHeight;
      }, 1000);
    });

    // Manual Mode Direct Navigation Cards
    cardManualCompany.addEventListener('click', () => toggleCompanyState(true));
    cardManualWorkforce.addEventListener('click', () => toggleWorkforce(true));
    cardManualActivity.addEventListener('click', () => toggleActivitySheet(true));
    cardManualAudit.addEventListener('click', () => openAuditModal());
    cardManualDecisions.addEventListener('click', () => {
      setOperatingMode('jarvis');
      setCoreState('waiting_for_founder');
    });
    cardManualWork.addEventListener('click', () => {
      setOperatingMode('jarvis');
      setCoreState('working');
    });
    cardManualResearch.addEventListener('click', () => {
      setOperatingMode('jarvis');
      setCoreState('understanding');
    });

    // Global Keybindings (1..7 for the 7 states)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleCompanyState(false);
        toggleActivitySheet(false);
        toggleWorkforce(false);
        closeAuditModal();
        closeSteering();
        messengerDrawer.classList.remove('open');
      }

      if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        const stateKeys = Object.keys(CORE_STATES);
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= stateKeys.length) {
          setCoreState(stateKeys[num - 1]);
        }
        if (e.key === 'c' || e.key === 'C') toggleCompanyState();
        if (e.key === 'w' || e.key === 'W') toggleWorkforce();
        if (e.key === 'a' || e.key === 'A') toggleActivitySheet();
        if (e.key === 'm' || e.key === 'M') toggleMessenger();
      }
    });

    // Backdrop click
    auditModal.addEventListener('click', (e) => {
      if (e.target === auditModal) closeAuditModal();
    });
  }

  // --- INITIALIZATION ---
  function init() {
    initStarfield();
    initEarthHorizon();
    bindEvents();
    updateClock();
    setInterval(updateClock, 30000);
    requestAnimationFrame(renderLoop);
  }

  window.addEventListener('DOMContentLoaded', init);

})();
