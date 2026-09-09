/**
 * Verification script for SamJuniorsOS Core V5 Prototype
 * (Conversational Dark-Room Operating Center)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '../public/prototype/v5/index.html');
const cssPath = path.join(__dirname, '../public/prototype/v5/prototype.css');
const jsPath = path.join(__dirname, '../public/prototype/v5/prototype.js');

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`✗ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("==========================================");
console.log("VERIFYING SAMJUNIORS OS — CORE V5 PROTOTYPE");
console.log("==========================================\n");

// 1. Check file existence
assert(fs.existsSync(htmlPath), 'index.html exists');
assert(fs.existsSync(cssPath), 'prototype.css exists');
assert(fs.existsSync(jsPath), 'prototype.js exists');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// 2. Syntax validation
try {
  new vm.Script(js);
  assert(true, 'prototype.js syntax: VALID');
} catch (e) {
  assert(false, `prototype.js syntax error: ${e.message}`);
}

// 3. Required DOM elements for Core V5
const requiredIds = [
  'ambientDarkroom', 'lightingCanvas', 'floorReflection',
  'edgeHeader', 'systemPresenceLabel', 'creditsToggle', 'creditsCount',
  'modeJarvis', 'modeManual', 'osDrawerOpenBtn',
  'coreChamber', 'coreStage', 'coreCanvas', 'coreGlowAura',
  'coreDialogueContainer', 'coreStateDot', 'coreStateText', 'coreSpeechLine',
  'inputContainer', 'conversationalForm', 'conversationalInput', 'micBtn', 'sendBtn', 'suggestionChips',
  'eventExpansionSurface', 'paneUnderstanding', 'paneActiveWork', 'paneDecision', 'paneCompleted', 'paneBlocked',
  'workTitle', 'workStepText', 'stepRibbon', 'btnSteerWork', 'btnPauseWork', 'btnHaltWork',
  'inlineSteerBox', 'inlineSteerInput', 'btnSubmitSteer',
  'decisionHeading', 'decisionSummary', 'btnAuthorizeDecision', 'btnRedirectDecision', 'btnDeclineDecision', 'btnInspectDecision',
  'outcomeTitle', 'outcomeDescription', 'btnInspectOutcomeEvidence', 'btnViewProvenance', 'btnDismissOutcome',
  'blockedTitle', 'blockedDescription', 'btnAcknowledgeBlocked',
  'edgeFooter', 'dockCompanyBtn', 'dockWorkforceBtn', 'dockDecisionsBtn', 'dockMessengerBtn', 'edgeOsPill',
  'osDrawerOverlay', 'osDrawer', 'drawerCloseBtn', 'drawerNav',
  'tabPaneCompany', 'tabPaneWorkforce', 'tabPaneDecisions', 'tabPaneResearch', 'tabPaneActivity', 'tabPaneAudit', 'tabPaneMessenger',
  'provenanceModal', 'provenanceCloseBtn'
];

let missingIds = [];
for (let id of requiredIds) {
  if (!html.includes(`id="${id}"`)) {
    missingIds.push(id);
  }
}
assert(missingIds.length === 0, `All ${requiredIds.length} required DOM IDs present (missing: ${missingIds.join(', ')})`);

// 4. Demo safety watermark
assert(html.includes('DEMO STATE · NO LIVE COMPANY DATA CONNECTED'), 'Persistent DEMO STATE watermark present in HTML');

// 5. 7 Governed OS modules present in drawer
const governedModules = ['company', 'workforce', 'decisions', 'research', 'activity', 'audit', 'messenger'];
let missingModules = governedModules.filter(m => !html.includes(`data-tab="${m}"`));
assert(missingModules.length === 0, `All 7 governed OS modules present in navigation (missing: ${missingModules.join(', ')})`);

// 6. Decision action verbs
assert(html.includes('btnAuthorizeDecision') && html.includes('btnRedirectDecision') && html.includes('btnDeclineDecision') && html.includes('btnInspectDecision'), 'All 4 founder authority actions present: Authorize, Redirect, Decline, Inspect');

// 7. No network calls to backend
assert(!js.includes('fetch(') && !js.includes('new XMLHttpRequest') && !js.includes('new WebSocket'), 'Zero network calls to backend (client-side simulation)');

// 8. No fabricated facts / fake telemetry
const forbiddenFabrications = ['GPT-4', 'Claude 3.5', '$42,000', 'MRR', 'ARR', '99.9% uptime', '14 employees'];
let foundFabrications = forbiddenFabrications.filter(f => html.includes(f) || js.includes(f));
assert(foundFabrications.length === 0, `Zero fabricated metrics/claims found (violations: ${foundFabrications.join(', ')})`);

// 9. Exposed __v5 test interface
assert(js.includes('window.__v5 ='), 'Exposed window.__v5 programmatic test interface');

console.log("\n------------------------------------------");
if (failures === 0) {
  console.log("✓ ALL CORE V5 PROTOTYPE CHECKS PASSED!");
  process.exit(0);
} else {
  console.error(`✗ ${failures} CHECKS FAILED!`);
  process.exit(1);
}
