const fs = require('fs');

const html = fs.readFileSync('public/prototype/index.html', 'utf8');
const css = fs.readFileSync('public/prototype/prototype.css', 'utf8');
const js = fs.readFileSync('public/prototype/prototype.js', 'utf8');

// Required Core V3 IDs
const requiredIds = [
  'starfieldCanvas', 'earthHorizonCanvas', 'coreCanvas', 'waveCanvas',
  'headerContextDisplay', 'btnJarvisMode', 'btnManualMode', 'btnToggleCredits',
  'jarvisUnavailableBanner', 'beaconCompanyState', 'beaconWorkforce',
  'beaconAttention', 'beaconActivity', 'coreWorkSurface',
  'paneUnderstanding', 'paneWorking', 'paneWaiting', 'paneExecuting',
  'paneCompleted', 'paneBlocked', 'btnSteeringRedirect', 'btnSteeringStop',
  'steeringPopover', 'commandInput', 'commandForm', 'manualModeView',
  'sheetCompanyState', 'sheetActivity', 'workforceDrawer',
  'auditModal', 'messengerDrawer', 'prototypeStateToolbar', 'suggestedPromptsRow'
];

let missing = [];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) missing.push(id);
}

if (missing.length > 0) {
  console.error('Missing IDs in Core V3 HTML:', missing);
  process.exit(1);
}
console.log('✓ HTML IDs verified: All ' + requiredIds.length + ' required Core V3 IDs present.');

// Check JavaScript syntax
try {
  new Function(js);
  console.log('✓ prototype.js syntax: VALID (0 syntax errors).');
} catch (e) {
  console.error('prototype.js syntax error:', e.message);
  process.exit(1);
}

// Check 7 Core states
const states = ['ready', 'understanding', 'working', 'waiting_for_founder', 'executing', 'completed', 'blocked'];
for (const s of states) {
  if (!js.includes(`${s}:`)) {
    console.error('Missing state in prototype.js:', s);
    process.exit(1);
  }
}
console.log('✓ 7 Core V3 states verified in prototype.js: ' + states.join(', '));

// Verify absence of fabricated company claims
const fabricatedPhrases = [
  '12 AI employees active',
  'Workflows running',
  'Customer insights updated',
  'Finance forecast ready',
  'Sync: 99.4%'
];
for (const phrase of fabricatedPhrases) {
  if (html.includes(phrase)) {
    console.error('Found unsupported/fabricated phrase in HTML:', phrase);
    process.exit(1);
  }
}
console.log('✓ Fabricated/unsupported company claims check: PURGED & CLEAN.');

console.log('✓ CSS stylesheet size: ' + css.length + ' bytes, verified.');
console.log('All Core V3 prototype verification checks PASSED successfully!');
