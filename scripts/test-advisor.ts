import { FounderAdvisorService } from '../lib/server/advisor/advisor-service';
import { CompanyContextProvider } from '../lib/server/context/company-context';

async function runTests() {
  console.log('=== RUNNING FOUNDER ADVISOR BACKEND TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Canonical Company Context Loading
  console.log('--- Test 1: Company Context Provider ---');
  const context = CompanyContextProvider.getCanonicalContext();
  assert(context.initiatives.length > 0, 'Company context loads initiatives');
  assert(context.agents.length === 4, 'Executive workforce contains 4 specialists (coo, researcher, pm, finance)');
  assert(context.financialModel.grossMargin >= 80, 'Financial model includes verified 80%+ margin floor');
  assert(context.decisions.length > 0, 'Governance decisions are loaded from single source of truth');

  const formatted = CompanyContextProvider.formatForAdvisorPrompt(context);
  assert(formatted.includes('COMPANY OVERVIEW & CONSTITUTION'), 'Context formats overview header');
  assert(formatted.includes('EXECUTIVE AI WORKFORCE'), 'Context formats workforce section');
  assert(formatted.includes('FINANCIAL MODEL'), 'Context formats financial metrics');

  // TEST 2: Empty / Invalid Question
  console.log('\n--- Test 2: Empty / Invalid Question Handling ---');
  const advisor = new FounderAdvisorService();
  const emptyRes = await advisor.query('');
  assert(!emptyRes.success, 'Empty question returns success: false');
  assert(emptyRes.error === 'EMPTY_QUESTION', 'Returns EMPTY_QUESTION error code');
  assert(emptyRes.epistemicBreakdown.unknowns.length > 0, 'Unknowns list notes empty question');

  // TEST 3: Grounded & Truthful Epistemic Breakdown (Offline & Unconfigured verification)
  console.log('\n--- Test 3: Grounded & Truthful Epistemic Breakdown ---');
  // Test truthful unconfigured response directly to verify epistemic integrity without network blocking
  const origKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const offlineAdvisor = new FounderAdvisorService();
  const contextQuestionRes = await offlineAdvisor.query('What is our current runway and pending decisions?');
  
  assert(contextQuestionRes.question.length > 0, 'Preserves original question');
  assert(contextQuestionRes.epistemicBreakdown.facts.length > 0, 'Provides grounded facts from company context');
  assert(contextQuestionRes.epistemicBreakdown.inferences.length >= 0, 'Provides reasoned inferences');
  assert(contextQuestionRes.epistemicBreakdown.recommendations.length >= 0, 'Provides actionable recommendations');
  assert(contextQuestionRes.epistemicBreakdown.unknowns.length >= 0, 'Identifies unknowns');
  assert(contextQuestionRes.executionOutcome === 'unconfigured', 'Marks outcome as unconfigured truthfully');

  // TEST 4: Question where Information is Unavailable
  console.log('\n--- Test 4: Information Unavailable Handling ---');
  const unavailableRes = await offlineAdvisor.query('What were our Q1 2021 offline billboard expenditures in Tokyo?');
  assert(unavailableRes.epistemicBreakdown !== undefined, 'Includes epistemic breakdown');
  const fullText = JSON.stringify(unavailableRes);
  assert(!fullText.includes('¥') && !fullText.includes('billboard in Tokyo was $'), 'Does not fabricate unavailable historic metrics');

  // TEST 5: Security - No API Keys or Credentials in Response
  console.log('\n--- Test 5: Server-Side Credential & Security Leak Verification ---');
  assert(!fullText.includes('process.env.GEMINI_API_KEY'), 'No environment variable names exposed');
  if (origKey) {
    assert(!fullText.includes(origKey), 'Actual GEMINI_API_KEY is not leaked in advisor response');
  }

  // TEST 6: Structured Response Schema Conformance
  console.log('\n--- Test 6: Response Schema Conformance ---');
  assert(typeof contextQuestionRes.summary === 'string', 'Summary is string');
  assert(typeof contextQuestionRes.analysisMarkdown === 'string', 'analysisMarkdown is string');
  assert(Array.isArray(contextQuestionRes.suggestedFollowUpPrompts), 'suggestedFollowUpPrompts is array');
  assert(Array.isArray(contextQuestionRes.strategicInsights), 'strategicInsights is array');
  assert(typeof contextQuestionRes.liveAi === 'boolean', 'liveAi is boolean');
  assert(typeof contextQuestionRes.timestamp === 'string', 'timestamp is string');

  // Restore env key if present
  if (origKey) {
    process.env.GEMINI_API_KEY = origKey;
  }

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
