/**
 * Core V4 prototype verifier — structural + safety checks.
 * Run from repository root: node scripts/verify-prototype-v4.js
 */
const fs = require('fs');

const html = fs.readFileSync('public/prototype/v4/index.html', 'utf8');
const css = fs.readFileSync('public/prototype/v4/prototype.css', 'utf8');
const js = fs.readFileSync('public/prototype/v4/prototype.js', 'utf8');

let failures = 0;
function check(label, ok) {
  if (!ok) { failures++; console.error(`✗ ${label}`); }
  else { console.log(`✓ ${label}`); }
}

// 1. Required Core V4 IDs (five layers + persistent work + attention + surfaces)
const requiredIds = [
  // Layer 1 — founder intent
  'commandForm', 'commandInput', 'paneUnderstanding', 'intentQuoteDisplay',
  'understandingTitle', 'understandingDesc',
  // Layer 2 — active work (persistent identity)
  'paneActiveWork', 'activeWorkTitle', 'activeWorkWhy', 'activeWorkCurrentStep',
  'activeWorkEvidence', 'activeWorkNext', 'taskStepsChecklist',
  'btnWorkSteer', 'btnWorkPause', 'btnWorkStop', 'steeringAppliedNote',
  // Layer 3 — attention model
  'whatMattersStrip', 'wmState', 'companyContextStrip', 'ctxWorkingOn', 'ctxAttention',
  // Layer 4 — authority boundary
  'paneDecision', 'decisionPrepared', 'decisionReason', 'decisionRecommendation',
  'btnDecisionApprove', 'btnDecisionReject', 'btnDecisionRedirect', 'btnDecisionInspect',
  // Layer 5 — outcome + provenance
  'paneOutcome', 'outcomeSummaryText', 'outcomeEvidenceText',
  'btnOutcomeReview', 'btnOutcomeEvidence', 'btnOutcomeProvenance', 'btnOutcomeContinue',
  'auditModal', 'auditTableBody', 'auditScopeLine',
  // Persistent work identity
  'workThreadsDock', 'dockThreadsRow',
  // Conversational steering + interruption
  'steeringComposer', 'steeringForm', 'steeringInput', 'paneInterrupt',
  'interruptPrevDirection', 'interruptNewDirection',
  // Modes + credits
  'btnJarvisMode', 'btnManualMode', 'btnToggleCredits', 'jarvisUnavailableBanner',
  'btnRestoreCredits', 'manualModeView',
  // Secondary surfaces
  'sheetCompanyState', 'sheetActivity', 'sheetDecisions', 'sheetWork',
  'workforceDrawer', 'messengerDrawer', 'beaconCompanyState', 'beaconWorkforce',
  'beaconDecisions', 'beaconActivity',
  // Company state QA + decisions + work sheet
  'qaHappening', 'qaChanged', 'qaAttention', 'qaWorkedOn',
  'decisionsEmpty', 'decisionsList', 'workSheetEmpty', 'workSheetList',
  // Simulation controls
  'btnResetDemo',
  // Canvases (visual language carried from V3)
  'starfieldCanvas', 'earthHorizonCanvas', 'coreCanvas', 'waveCanvas'
];

const missingIds = requiredIds.filter(id => !html.includes(`id="${id}"`));
check(`HTML IDs: all ${requiredIds.length} required Core V4 IDs present`, missingIds.length === 0);
if (missingIds.length) console.error('  Missing:', missingIds);

// 2. Demo watermark present in HTML
check('HTML: persistent DEMO STATE watermark present',
  html.includes('DEMO STATE · NO LIVE COMPANY DATA CONNECTED'));

// 3. JS syntax valid
let jsSyntaxOk = true;
try { new Function(js); } catch (e) { jsSyntaxOk = false; console.error('  JS syntax error:', e.message); }
check('prototype.js syntax: VALID', jsSyntaxOk);

// 4. The 7 states remain internal (state machine + body classes)
const states = ['ready', 'understanding', 'working', 'waiting_for_founder', 'executing', 'completed', 'blocked'];
const missingStates = states.filter(s => !js.includes(`${s}:`));
check('7 internal Core states present in prototype.js', missingStates.length === 0);

// 5. V4 pane mapping in CSS
check('CSS: V4 pane mapping (understanding/active-work/decision/outcome/blocked/interrupt)',
  css.includes('body.state-understanding #paneUnderstanding') &&
  css.includes('body.state-working #paneActiveWork') &&
  css.includes('body.state-waiting_for_founder #paneDecision') &&
  css.includes('body.state-completed #paneOutcome') &&
  css.includes('body.interrupting #paneInterrupt'));

// 6. Steering composer (conversational, not button-only)
check('HTML: conversational steering composer with textarea + examples',
  html.includes('steering-textarea') &&
  html.includes('Tell Core how you want to change direction') &&
  (html.match(/steering-example-chip/g) || []).length >= 4);

// 7. Decision actions include all four verbs (by button id + visible label)
check('HTML: APPROVE / REDIRECT / REJECT / INSPECT actions',
  html.includes('id="btnDecisionApprove"') && html.includes('id="btnDecisionReject"') &&
  html.includes('id="btnDecisionRedirect"') && html.includes('id="btnDecisionInspect"') &&
  /APPROVE\s*<\/button>/.test(html) && /REJECT\s*<\/button>/.test(html) &&
  /REDIRECT\s*<\/button>/.test(html) && /INSPECT\s*<\/button>/.test(html));

// 8. Manual mode exposes all modules WITHOUT Jarvis
const modules = ['cardManualCompany', 'cardManualWork', 'cardManualDecisions',
  'cardManualResearch', 'cardManualWorkforce', 'cardManualActivity',
  'cardManualAudit', 'cardManualMessenger'];
check('HTML: Manual mode exposes 8 governed modules', modules.every(m => html.includes(`id="${m}"`)));

// 9. Workforce honesty — repo-confirmed roster only, generic semantics
check('JS/HTML: no fabricated workforce telemetry (no model names / performance % / employee counts)',
  !/performance\s*\d|model\s*name|employees? active/i.test(html + js));

// 10. Provenance chain stages
const stages = ['SOURCE', 'SIGNAL', 'CLAIM', 'FACT', 'DECISION', 'OUTCOME'];
check('HTML: provenance chain exposes all 6 stages', stages.every(s => html.includes(`tag-source">${s}`)));

// 11. AI credits gate AI capability, not OS access
check('HTML: credits banner says Manual remains accessible',
  html.includes('the OS itself remains fully accessible in MANUAL mode'));

// 12. Work threads persist (dock + sheet + continue-work action)
check('JS: persistent work identity (dock rendering + work sheet rows)',
  js.includes('function renderDock') && js.includes('function renderWorkSheet'));
check('JS: CONTINUE WORK reopens completed/rejected threads',
  js.includes("t.status === 'completed' || t.status === 'rejected' || t.status === 'stopped'"));

// 13. Authority boundary honesty
check('HTML: authority note — Core is not authorized to perform consequential actions',
  html.includes('it is not authorized to perform consequential actions'));

// 14. Fabricated company facts absent
const fabricatedPhrases = [
  '12 AI employees active', 'Workflows running', 'Customer insights updated',
  'Finance forecast ready', 'Sync: 99.4%', 'MRR', 'GitHub release',
  'cryptographic guarantee', 'verified by cryptography'
];
const found = fabricatedPhrases.filter(p => (html + js).toLowerCase().includes(p.toLowerCase()));
check('No fabricated company facts/metrics/claims', found.length === 0);
if (found.length) console.error('  Found:', found);

// 15. Learning not falsely claimed as persisted
check('HTML: outcome pane states learning is NOT persisted in prototype',
  html.includes('Learning is not persisted in this prototype'));

// 16. No backend calls — pure client simulation
check('JS: no fetch/XHR/WebSocket to any backend',
  !/fetch\(|XMLHttpRequest|WebSocket|io\(/.test(js));

console.log(failures === 0
  ? `\nAll Core V4 prototype verification checks PASSED (${css.length} bytes CSS, ${js.length} bytes JS).`
  : `\nFAILED: ${failures} check(s).`);
process.exit(failures === 0 ? 0 : 1);
