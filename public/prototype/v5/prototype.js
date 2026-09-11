/**
 * ==========================================================================
 * SAMJUNIORS OS — CORE V5 PROTOTYPE SCRIPT
 * Conversational Operating Center (Dark-Room + Single-Light Core Presence)
 * ==========================================================================
 * - Single intelligent luminous Core in a dark, quiet room.
 * - Dialogue-first interaction: Core speaks directly to the founder.
 * - Progressive disclosure: UI expands naturally around active work, decisions,
 *   and outcomes, and recedes when idle.
 * - Edge indicators and slide-over OS drawer for deep system navigation.
 * - Strictly client-side simulation. No backend, no APIs, no persistence.
 * ==========================================================================
 */

(function () {
  'use strict';

  // ========================================================================
  // 1. STATE DEFINITIONS & METADATA
  // ========================================================================
  const CORE_STATES = {
    ready: {
      label: 'LISTENING · READY FOR INTENT',
      color: '#38BDF8',
      secondaryColor: '#8B5CF6',
      lightIntensity: 0.18,
      pulseSpeed: 0.0018
    },
    understanding: {
      label: 'UNDERSTANDING · GATHERING CONTEXT',
      color: '#00E5FF',
      secondaryColor: '#6366F1',
      lightIntensity: 0.28,
      pulseSpeed: 0.0035
    },
    working: {
      label: 'WORKING · SYNTHESIZING SIGNALS',
      color: '#8B5CF6',
      secondaryColor: '#38BDF8',
      lightIntensity: 0.32,
      pulseSpeed: 0.0042
    },
    waiting_for_founder: {
      label: 'FOUNDER ATTENTION REQUIRED',
      color: '#F59E0B',
      secondaryColor: '#F97316',
      lightIntensity: 0.38,
      pulseSpeed: 0.0022
    },
    executing: {
      label: 'EXECUTING AUTHORIZED ACTION',
      color: '#10B981',
      secondaryColor: '#00E5FF',
      lightIntensity: 0.34,
      pulseSpeed: 0.0045
    },
    completed: {
      label: 'OUTCOME RECORDED',
      color: '#10B981',
      secondaryColor: '#8B5CF6',
      lightIntensity: 0.22,
      pulseSpeed: 0.0015
    },
    blocked: {
      label: 'GOVERNANCE HALT',
      color: '#F43F5E',
      secondaryColor: '#F59E0B',
      lightIntensity: 0.26,
      pulseSpeed: 0.002
    }
  };

  let currentState = 'ready';
  let currentMode = 'jarvis';
  let creditsAvailable = true;
  let activeDirective = null;
  let activeWorkTimer = null;
  let isSpeaking = false;
  let speechVocalTimer = null;

  // ========================================================================
  // 2. DOM REFERENCES
  // ========================================================================
  const $ = (id) => document.getElementById(id);

  const lightingCanvas = $('lightingCanvas');
  const floorReflection = $('floorReflection');
  const coreCanvas = $('coreCanvas');
  const coreGlowAura = $('coreGlowAura');

  const coreStateDot = $('coreStateDot');
  const coreStateText = $('coreStateText');
  const coreSpeechLine = $('coreSpeechLine');

  const inputForm = $('conversationalForm');
  const conversationalInput = $('conversationalInput');
  const micBtn = $('micBtn');
  const suggestionChips = $('suggestionChips');

  const eventExpansionSurface = $('eventExpansionSurface');
  const paneUnderstanding = $('paneUnderstanding');
  const paneActiveWork = $('paneActiveWork');
  const paneDecision = $('paneDecision');
  const paneCompleted = $('paneCompleted');
  const paneBlocked = $('paneBlocked');

  const understandingQuote = $('understandingQuote');
  const workTitle = $('workTitle');
  const workStepText = $('workStepText');
  const stepRibbon = $('stepRibbon');
  const btnSteerWork = $('btnSteerWork');
  const btnPauseWork = $('btnPauseWork');
  const btnHaltWork = $('btnHaltWork');
  const inlineSteerBox = $('inlineSteerBox');
  const inlineSteerInput = $('inlineSteerInput');
  const btnSubmitSteer = $('btnSubmitSteer');

  const btnAuthorizeDecision = $('btnAuthorizeDecision');
  const btnRedirectDecision = $('btnRedirectDecision');
  const btnDeclineDecision = $('btnDeclineDecision');
  const btnInspectDecision = $('btnInspectDecision');

  const btnInspectOutcomeEvidence = $('btnInspectOutcomeEvidence');
  const btnViewProvenance = $('btnViewProvenance');
  const btnDismissOutcome = $('btnDismissOutcome');
  const btnAcknowledgeBlocked = $('btnAcknowledgeBlocked');

  const modeJarvis = $('modeJarvis');
  const modeManual = $('modeManual');
  const creditsToggle = $('creditsToggle');
  const creditsCount = $('creditsCount');

  const osDrawerOpenBtn = $('osDrawerOpenBtn');
  const edgeOsPill = $('edgeOsPill');
  const osDrawerOverlay = $('osDrawerOverlay');
  const osDrawer = $('osDrawer');
  const drawerCloseBtn = $('drawerCloseBtn');
  const drawerNav = $('drawerNav');
  const drawerModeIndicator = $('drawerModeIndicator');
  const btnDrawerJumpDecision = $('btnDrawerJumpDecision');

  const dockCompanyBtn = $('dockCompanyBtn');
  const dockWorkforceBtn = $('dockWorkforceBtn');
  const dockDecisionsBtn = $('dockDecisionsBtn');
  const dockMessengerBtn = $('dockMessengerBtn');

  const provenanceModal = $('provenanceModal');
  const provenanceCloseBtn = $('provenanceCloseBtn');

  // ========================================================================
  // 3. VOLUMETRIC ROOM LIGHTING & PHYSICAL FLOOR REFLECTION
  // ========================================================================
  const lightCtx = lightingCanvas ? lightingCanvas.getContext('2d') : null;

  function resizeLighting() {
    if (!lightingCanvas) return;
    lightingCanvas.width = window.innerWidth;
    lightingCanvas.height = window.innerHeight;
  }

  function drawVolumetricLighting(time) {
    if (!lightCtx) return;
    const w = lightingCanvas.width;
    const h = lightingCanvas.height;
    lightCtx.clearRect(0, 0, w, h);

    const stateMeta = CORE_STATES[currentState] || CORE_STATES.ready;
    const cx = w / 2;
    const cy = h * 0.32; // position of Core in chamber

    // Soft volumetric light cone cast from Core downward into the room
    const vocalJitter = isSpeaking ? Math.sin(time * 0.02) * 0.04 : 0;
    const intensity = stateMeta.lightIntensity + vocalJitter;

    const coneGrad = lightCtx.createRadialGradient(cx, cy, 30, cx, cy + 280, 520);
    coneGrad.addColorStop(0, stateMeta.color + Math.floor(intensity * 255).toString(16).padStart(2, '0'));
    coneGrad.addColorStop(0.35, stateMeta.secondaryColor + '12');
    coneGrad.addColorStop(0.8, 'rgba(2, 4, 8, 0.4)');
    coneGrad.addColorStop(1, 'transparent');

    lightCtx.save();
    lightCtx.fillStyle = coneGrad;
    lightCtx.fillRect(0, 0, w, h);
    lightCtx.restore();

    // Sync floor reflection glow
    if (floorReflection) {
      floorReflection.style.background = `radial-gradient(ellipse at 50% 100%, ${stateMeta.color}18 0%, ${stateMeta.secondaryColor}08 40%, transparent 75%)`;
    }
  }

  // ========================================================================
  // 4. LIVING INTELLIGENCE CORE (Physical Spherical Renderer)
  // ========================================================================
  const coreCtx = coreCanvas ? coreCanvas.getContext('2d') : null;
  let coreFilaments = [];

  function initFilaments() {
    coreFilaments = [];
    for (let i = 0; i < 24; i++) {
      coreFilaments.push({
        angle: Math.random() * Math.PI * 2,
        speed: (Math.random() - 0.5) * 0.006 + 0.002,
        length: Math.random() * 60 + 20,
        radius: Math.random() * 85 + 15,
        alpha: Math.random() * 0.6 + 0.2
      });
    }
  }

  function drawCorePresence(time) {
    if (!coreCtx) return;
    const w = coreCanvas.width;
    const h = coreCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const stateMeta = CORE_STATES[currentState] || CORE_STATES.ready;

    coreCtx.clearRect(0, 0, w, h);

    const baseRadius = 88;
    const breathe = Math.sin(time * stateMeta.pulseSpeed) * 3;
    const vocalBump = isSpeaking ? Math.sin(time * 0.035) * 4 : 0;
    const r = baseRadius + breathe + vocalBump;

    coreCtx.save();

    // A. Outer soft atmospheric bloom
    const outerBloom = coreCtx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.8);
    outerBloom.addColorStop(0, stateMeta.color + '44');
    outerBloom.addColorStop(0.5, stateMeta.secondaryColor + '18');
    outerBloom.addColorStop(1, 'transparent');
    coreCtx.fillStyle = outerBloom;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    coreCtx.fill();

    // B. Physical sphere body shading (Obsidian depth with directional light)
    const lightX = cx - r * 0.3;
    const lightY = cy - r * 0.35;
    const sphereGrad = coreCtx.createRadialGradient(lightX, lightY, 4, cx, cy, r);
    
    if (currentState === 'waiting_for_founder') {
      sphereGrad.addColorStop(0, '#5A3508');
      sphereGrad.addColorStop(0.4, '#241403');
      sphereGrad.addColorStop(0.85, '#0A0501');
      sphereGrad.addColorStop(1, '#020100');
    } else if (currentState === 'blocked') {
      sphereGrad.addColorStop(0, '#5C111C');
      sphereGrad.addColorStop(0.4, '#26060B');
      sphereGrad.addColorStop(0.85, '#0A0103');
      sphereGrad.addColorStop(1, '#020001');
    } else if (currentState === 'working') {
      sphereGrad.addColorStop(0, '#2D164E');
      sphereGrad.addColorStop(0.4, '#130826');
      sphereGrad.addColorStop(0.85, '#06020E');
      sphereGrad.addColorStop(1, '#020105');
    } else {
      sphereGrad.addColorStop(0, '#102B3F');
      sphereGrad.addColorStop(0.4, '#081726');
      sphereGrad.addColorStop(0.85, '#040B13');
      sphereGrad.addColorStop(1, '#010306');
    }

    coreCtx.fillStyle = sphereGrad;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, r, 0, Math.PI * 2);
    coreCtx.fill();

    // C. Internal circulating energy filaments (Intelligence thoughts)
    for (let fil of coreFilaments) {
      fil.angle += fil.speed;
      const fx = cx + Math.cos(fil.angle) * fil.radius;
      const fy = cy + Math.sin(fil.angle) * (fil.radius * 0.55); // slight elliptical perspective
      const distToCenter = Math.hypot(fx - cx, fy - cy);
      if (distToCenter > r * 0.85) continue;

      coreCtx.beginPath();
      coreCtx.arc(fx, fy, 1.4, 0, Math.PI * 2);
      coreCtx.fillStyle = stateMeta.color + Math.floor(fil.alpha * 255).toString(16).padStart(2, '0');
      coreCtx.fill();
    }

    // D. Soft specular highlight rim on the sphere
    const rimGrad = coreCtx.createRadialGradient(lightX, lightY, 1, lightX, lightY, r * 0.85);
    rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    rimGrad.addColorStop(0.12, 'rgba(255, 255, 255, 0.15)');
    rimGrad.addColorStop(0.35, stateMeta.color + '33');
    rimGrad.addColorStop(1, 'transparent');

    coreCtx.fillStyle = rimGrad;
    coreCtx.beginPath();
    coreCtx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
    coreCtx.fill();

    // E. Delicate equatorial orbit ring (subdued, elegant)
    coreCtx.strokeStyle = stateMeta.color + '33';
    coreCtx.lineWidth = 1;
    coreCtx.beginPath();
    coreCtx.ellipse(cx, cy, r * 1.35, r * 0.38, Math.PI * 0.08, 0, Math.PI * 2);
    coreCtx.stroke();

    coreCtx.restore();
  }

  // ========================================================================
  // 5. CORE CONVERSATIONAL SPEECH ENGINE
  // ========================================================================
  function speak(text, targetState = null, onFinish = null) {
    if (targetState && CORE_STATES[targetState]) {
      setCoreState(targetState);
    }

    isSpeaking = true;
    clearTimeout(speechVocalTimer);

    // Fade out slightly, swap text, fade in
    if (coreSpeechLine) {
      coreSpeechLine.style.opacity = '0';
      coreSpeechLine.style.transform = 'translateY(4px)';

      setTimeout(() => {
        coreSpeechLine.textContent = text;
        coreSpeechLine.style.opacity = '1';
        coreSpeechLine.style.transform = 'translateY(0)';
      }, 150);
    }

    // Natural vocal cadence simulation
    const speechDuration = Math.min(Math.max(text.length * 35, 1800), 4500);
    speechVocalTimer = setTimeout(() => {
      isSpeaking = false;
      if (typeof onFinish === 'function') onFinish();
    }, speechDuration);
  }

  function setCoreState(stateKey) {
    if (!CORE_STATES[stateKey]) return;
    currentState = stateKey;
    const meta = CORE_STATES[stateKey];

    if (coreStateDot) coreStateDot.style.backgroundColor = meta.color;
    if (coreStateText) coreStateText.textContent = meta.label;

    if (coreGlowAura) {
      coreGlowAura.style.background = `radial-gradient(circle, ${meta.color}22 0%, ${meta.secondaryColor}0a 45%, transparent 70%)`;
    }
  }

  // ========================================================================
  // 6. PROGRESSIVE DISCLOSURE EVENT EXPANSION CONTROLS
  // ========================================================================
  function hideAllPanes() {
    [paneUnderstanding, paneActiveWork, paneDecision, paneCompleted, paneBlocked].forEach(p => {
      if (p) p.hidden = true;
    });
  }

  function expandEventPane(pane) {
    hideAllPanes();
    if (pane) {
      pane.hidden = false;
      eventExpansionSurface.setAttribute('aria-expanded', 'true');
    }
  }

  function collapseEventSurface() {
    eventExpansionSurface.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      hideAllPanes();
    }, 350);
  }

  // ========================================================================
  // 7. SIMULATION SCENARIOS & USER INTENT PROCESSING
  // ========================================================================
  function handleFounderIntent(userInput) {
    if (!userInput || !userInput.trim()) return;
    const text = userInput.trim();
    const lower = text.toLowerCase();

    // Check credits
    if (!creditsAvailable) {
      speak(
        "AI credits are depleted. Jarvis natural language processing is paused. However, all operating systems and modules remain fully accessible through Manual mode (⌘ OS).",
        'ready'
      );
      return;
    }

    // Interruption check: If work is running, handle redirect
    if (currentState === 'working') {
      handleFounderInterruption(text);
      return;
    }

    // A. "What needs my attention?" / "Attention" / "Decisions"
    if (lower.includes('attention') || lower.includes('decision') || lower.includes('pending')) {
      speak(
        "You have 1 pending authority boundary: approving the revised public brand positioning. Sophia and Thorne have prepared the proposal.",
        'waiting_for_founder'
      );
      expandEventPane(paneDecision);
      return;
    }

    // B. "Review positioning" / "Market positioning" / "Positioning"
    if (lower.includes('positioning') || lower.includes('review') || lower.includes('market')) {
      startPositioningReviewDirective(text);
      return;
    }

    // C. "Company health" / "Status" / "Company state"
    if (lower.includes('company') || lower.includes('health') || lower.includes('signals')) {
      speak(
        "Company operating baseline is fully nominal. Single-container execution lock is verified. No security or epistemic faults detected.",
        'ready'
      );
      collapseEventSurface();
      return;
    }

    // D. "Sophia" / "Thorne" / "Workforce"
    if (lower.includes('sophia') || lower.includes('thorne') || lower.includes('workforce') || lower.includes('employees')) {
      speak(
        "Sophia is on standby synthesizing strategic directives. Thorne has confirmed invariant verification. Both agents are operating strictly within v1 authority limits.",
        'ready'
      );
      collapseEventSurface();
      return;
    }

    // E. "Stop" / "Halt" / "Pause"
    if (lower.startsWith('stop') || lower.startsWith('halt')) {
      clearTimeout(activeWorkTimer);
      speak("All active processing halted safely. Core is standing by for your directive.", 'ready');
      collapseEventSurface();
      return;
    }

    // Default conversational intent handling
    speak(
      `Understood, Sam. Initiating exploratory analysis for "${text}". Gathering governed context from Company Brain.`,
      'understanding',
      () => {
        setTimeout(() => {
          startGenericDirective(text);
        }, 1200);
      }
    );
    if (understandingQuote) understandingQuote.textContent = `"${text}"`;
    expandEventPane(paneUnderstanding);
  }

  // Directive: Market Positioning Review
  function startPositioningReviewDirective(inputQuery) {
    activeDirective = {
      title: 'Market Positioning Synthesis',
      query: inputQuery,
      sources: 4,
      step: 1
    };

    speak(
      "Starting positioning review. Gathering 4 competitive sources and pricing benchmarks with Sophia.",
      'working'
    );

    if (workTitle) workTitle.textContent = activeDirective.title;
    if (workStepText) workStepText.textContent = "Synthesizing market signals from 4 verified sources...";
    updateStepRibbon(1);
    expandEventPane(paneActiveWork);

    clearTimeout(activeWorkTimer);
    activeWorkTimer = setTimeout(() => {
      // Advance to step 2
      if (workStepText) workStepText.textContent = "Evaluating AI-native positioning vs SaaS category claims...";
      updateStepRibbon(2);

      activeWorkTimer = setTimeout(() => {
        // Advance to step 3 (Synthesizing proposal)
        if (workStepText) workStepText.textContent = "Formulating proposal and checking brand impact...";
        updateStepRibbon(3);

        activeWorkTimer = setTimeout(() => {
          // Reach Founder Decision Required
          updateStepRibbon(4);
          speak(
            "I've completed the positioning synthesis. Because this alters external brand messaging, authenticated founder authority is required.",
            'waiting_for_founder'
          );
          expandEventPane(paneDecision);
        }, 3000);
      }, 2800);
    }, 2600);
  }

  function startGenericDirective(queryText) {
    activeDirective = {
      title: queryText,
      query: queryText,
      sources: 2,
      step: 1
    };
    if (workTitle) workTitle.textContent = queryText;
    if (workStepText) workStepText.textContent = "Context verified. Sophia and Thorne executing structured task...";
    updateStepRibbon(2);
    expandEventPane(paneActiveWork);

    clearTimeout(activeWorkTimer);
    activeWorkTimer = setTimeout(() => {
      speak("Analysis complete. Outcome ready for your review.", 'completed');
      expandEventPane(paneCompleted);
    }, 3800);
  }

  function handleFounderInterruption(newDirective) {
    clearTimeout(activeWorkTimer);
    speak(
      `Interruption acknowledged. Redirecting active work from "${activeDirective ? activeDirective.title : 'current task'}" to "${newDirective}".`,
      'understanding',
      () => {
        setTimeout(() => {
          startPositioningReviewDirective(newDirective);
        }, 1200);
      }
    );
  }

  function updateStepRibbon(stepIndex) {
    if (!stepRibbon) return;
    const nodes = stepRibbon.querySelectorAll('.step-node');
    const lines = stepRibbon.querySelectorAll('.step-line');

    nodes.forEach((node, idx) => {
      node.classList.remove('completed', 'active', 'pending');
      if (idx + 1 < stepIndex) {
        node.classList.add('completed');
        const dot = node.querySelector('.node-dot');
        if (dot) dot.textContent = '✓';
      } else if (idx + 1 === stepIndex) {
        node.classList.add('active');
        const dot = node.querySelector('.node-dot');
        if (dot) dot.textContent = '';
      } else {
        node.classList.add('pending');
        const dot = node.querySelector('.node-dot');
        if (dot) dot.textContent = '';
      }
    });

    lines.forEach((line, idx) => {
      if (idx + 1 < stepIndex) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    });
  }

  // ========================================================================
  // 8. DECISION ACTIONS & AUTHORITY BOUNDARY
  // ========================================================================
  if (btnAuthorizeDecision) {
    btnAuthorizeDecision.addEventListener('click', () => {
      speak(
        "Authorization recorded under Founder cryptographic session. Sophia and Thorne are committing the updated positioning.",
        'executing',
        () => {
          setTimeout(() => {
            speak(
              "Positioning update ratified and archived to Company Memory. All systems updated.",
              'completed'
            );
            expandEventPane(paneCompleted);
          }, 2400);
        }
      );
    });
  }

  if (btnRedirectDecision) {
    btnRedirectDecision.addEventListener('click', () => {
      speak(
        "Understood. How would you like Sophia to adjust the proposal? Enter your adjustment below.",
        'working'
      );
      expandEventPane(paneActiveWork);
      if (inlineSteerBox) inlineSteerBox.hidden = false;
      if (inlineSteerInput) inlineSteerInput.focus();
    });
  }

  if (btnDeclineDecision) {
    btnDeclineDecision.addEventListener('click', () => {
      speak(
        "Proposal declined. No changes have been applied to company positioning. Core is standing by.",
        'ready'
      );
      collapseEventSurface();
    });
  }

  if (btnInspectDecision) {
    btnInspectDecision.addEventListener('click', () => {
      if (provenanceModal) provenanceModal.hidden = false;
    });
  }

  // Steering in Active Work
  if (btnSteerWork) {
    btnSteerWork.addEventListener('click', () => {
      if (inlineSteerBox) {
        inlineSteerBox.hidden = !inlineSteerBox.hidden;
        if (!inlineSteerBox.hidden && inlineSteerInput) inlineSteerInput.focus();
      }
    });
  }

  if (btnSubmitSteer) {
    btnSubmitSteer.addEventListener('click', () => {
      const steerText = inlineSteerInput ? inlineSteerInput.value.trim() : '';
      if (!steerText) return;
      if (inlineSteerBox) inlineSteerBox.hidden = true;
      if (inlineSteerInput) inlineSteerInput.value = '';

      speak(
        `Steering applied: "${steerText}". Recalibrating analysis with new parameter.`,
        'working'
      );
      if (workStepText) workStepText.textContent = `Recalibrated: ${steerText}`;
    });
  }

  if (btnPauseWork) {
    btnPauseWork.addEventListener('click', () => {
      clearTimeout(activeWorkTimer);
      speak("Directive paused. Click Steer or type in the bar to resume.", 'ready');
    });
  }

  if (btnHaltWork) {
    btnHaltWork.addEventListener('click', () => {
      clearTimeout(activeWorkTimer);
      speak("Directive cancelled. Core returned to ready state.", 'ready');
      collapseEventSurface();
    });
  }

  // Outcome buttons
  if (btnInspectOutcomeEvidence) {
    btnInspectOutcomeEvidence.addEventListener('click', () => {
      openOsDrawerTab('research');
    });
  }

  if (btnViewProvenance) {
    btnViewProvenance.addEventListener('click', () => {
      if (provenanceModal) provenanceModal.hidden = false;
    });
  }

  if (btnDismissOutcome) {
    btnDismissOutcome.addEventListener('click', () => {
      speak("Standing by. What would you like to direct next?", 'ready');
      collapseEventSurface();
    });
  }

  if (btnAcknowledgeBlocked) {
    btnAcknowledgeBlocked.addEventListener('click', () => {
      speak("Invariant acknowledged. Core standing by.", 'ready');
      collapseEventSurface();
    });
  }

  // ========================================================================
  // 9. OS SLIDE-OVER DRAWER & MANUAL MODE
  // ========================================================================
  function openOsDrawer() {
    if (osDrawerOverlay) osDrawerOverlay.hidden = false;
  }

  function closeOsDrawer() {
    if (osDrawerOverlay) osDrawerOverlay.hidden = true;
  }

  function openOsDrawerTab(tabName) {
    openOsDrawer();
    const navItems = drawerNav ? drawerNav.querySelectorAll('.drawer-nav-item') : [];
    navItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const panes = document.querySelectorAll('.drawer-tab-pane');
    panes.forEach(p => p.classList.remove('active'));
    const targetPane = $(`tabPane${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (targetPane) targetPane.classList.add('active');
  }

  if (osDrawerOpenBtn) osDrawerOpenBtn.addEventListener('click', openOsDrawer);
  if (edgeOsPill) edgeOsPill.addEventListener('click', openOsDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeOsDrawer);

  if (osDrawerOverlay) {
    osDrawerOverlay.addEventListener('click', (e) => {
      if (e.target === osDrawerOverlay) closeOsDrawer();
    });
  }

  // Drawer tab switching
  if (drawerNav) {
    drawerNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.drawer-nav-item');
      if (!btn) return;
      const tabName = btn.getAttribute('data-tab');
      if (tabName) openOsDrawerTab(tabName);
    });
  }

  // Jump from drawer decision record to main chamber
  if (btnDrawerJumpDecision) {
    btnDrawerJumpDecision.addEventListener('click', () => {
      closeOsDrawer();
      speak(
        "Authority decision surface opened in the main chamber. Standing by for your approval or redirect.",
        'waiting_for_founder'
      );
      expandEventPane(paneDecision);
    });
  }

  // Edge dock shortcuts
  if (dockCompanyBtn) dockCompanyBtn.addEventListener('click', () => openOsDrawerTab('company'));
  if (dockWorkforceBtn) dockWorkforceBtn.addEventListener('click', () => openOsDrawerTab('workforce'));
  if (dockDecisionsBtn) dockDecisionsBtn.addEventListener('click', () => openOsDrawerTab('decisions'));
  if (dockMessengerBtn) dockMessengerBtn.addEventListener('click', () => openOsDrawerTab('messenger'));

  // Mode switcher (Jarvis vs Manual)
  if (modeJarvis) {
    modeJarvis.addEventListener('click', () => {
      currentMode = 'jarvis';
      modeJarvis.classList.add('active');
      if (modeManual) modeManual.classList.remove('active');
      speak("Jarvis interaction mode active. Talk with Core or issue directives.", 'ready');
      closeOsDrawer();
    });
  }

  if (modeManual) {
    modeManual.addEventListener('click', () => {
      currentMode = 'manual';
      modeManual.classList.add('active');
      if (modeJarvis) modeJarvis.classList.remove('active');
      speak("Manual mode engaged. Operating system modules opened for direct navigation.", 'ready');
      openOsDrawer();
    });
  }

  // Credits Toggle
  if (creditsToggle) {
    creditsToggle.addEventListener('click', () => {
      creditsAvailable = !creditsAvailable;
      if (creditsCount) {
        creditsCount.textContent = creditsAvailable ? '850 Credits' : '0 Credits';
      }
      if (!creditsAvailable) {
        speak(
          "Simulated AI Credits exhausted. Jarvis synthesis is unavailable, but all 7 OS modules remain fully functional in Manual mode.",
          'ready'
        );
      } else {
        speak("AI Credits replenished. Core conversational synthesis restored.", 'ready');
      }
    });
  }

  // Provenance modal close
  if (provenanceCloseBtn) {
    provenanceCloseBtn.addEventListener('click', () => {
      if (provenanceModal) provenanceModal.hidden = true;
    });
  }

  // Suggestion chips
  if (suggestionChips) {
    suggestionChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const query = chip.getAttribute('data-query');
      if (query) {
        if (conversationalInput) conversationalInput.value = query;
        handleFounderIntent(query);
      }
    });
  }

  // Input Form submission
  if (inputForm) {
    inputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!conversationalInput) return;
      const val = conversationalInput.value.trim();
      if (!val) return;
      conversationalInput.value = '';
      handleFounderIntent(val);
    });
  }

  // Microphone voice simulation
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      speak("Listening to voice... (simulated)", 'understanding', () => {
        setTimeout(() => {
          const simulatedQuery = "What needs my attention?";
          if (conversationalInput) conversationalInput.value = simulatedQuery;
          handleFounderIntent(simulatedQuery);
        }, 1200);
      });
    });
  }

  // Keyboard Shortcuts (⌘ + K or ⌘ + O for drawer, ESC to close)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'o')) {
      e.preventDefault();
      if (osDrawerOverlay && !osDrawerOverlay.hidden) {
        closeOsDrawer();
      } else {
        openOsDrawer();
      }
    }
    if (e.key === 'Escape') {
      closeOsDrawer();
      if (provenanceModal) provenanceModal.hidden = true;
    }
  });

  // ========================================================================
  // 10. MAIN RENDER LOOP & INITIALIZATION
  // ========================================================================
  function renderLoop(time) {
    drawVolumetricLighting(time);
    drawCorePresence(time);
    requestAnimationFrame(renderLoop);
  }

  function init() {
    window.addEventListener('resize', resizeLighting);
    resizeLighting();
    initFilaments();
    requestAnimationFrame(renderLoop);

    // Expose programmatic interface for automated verification & testing
    window.__v5 = {
      setCoreState,
      speak,
      handleFounderIntent,
      expandEventPane,
      collapseEventSurface,
      openOsDrawer,
      closeOsDrawer,
      openOsDrawerTab,
      get currentState() { return currentState; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
