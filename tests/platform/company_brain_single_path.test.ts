/**
 * G4.1 VERIFICATION SUITE — Company Brain as Single Read & Write Path
 * 
 * Milestone: M3 (Sofia remembers you and knows your company)
 * Step: G4.1
 * Exit Evidence: Static and runtime proof that no code path reads or writes
 * company state outside the Brain; old parallel legacy paths removed.
 */

import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { CompanyBrain } from '@/lib/server/brain/company-brain';
import { CompanyContextProvider } from '@/lib/server/context/company-context';
import { SophiaContextAssembler } from '@/lib/server/sophia/context-assembly';
import { getSofiaGreeting } from '@/lib/server/sophia/greeting';
import { SophiaMemoryStore } from '@/lib/server/sophia/personal-memory-store';
import { SophiaServerGateway } from '@/lib/server/sophia/server-gateway';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { ProductFeature, CustomerDeal, AttentionItem, CompanyInitiative, FinanceMetric, ResearchTopic } from '@/types/os';

const DATA_DIR = path.resolve(process.cwd(), '.data');

const TOUCHED_DATA_FILES = [
  'company_state.json',
  'company_state.json.initialized',
  'company_intelligence.json',
  'company_intelligence.json.initialized',
  'company_memories.json',
  'company_memories.json.initialized',
  'company_knowledge.json',
  'company_knowledge.json.initialized',
  'agent_runs.json',
  'agent_runs.json.initialized',
  'epistemic_claims.json',
  'epistemic_claims.json.initialized',
  'sophia_memories.json',
  'sophia_memories.json.initialized',
  'decisions.json',
  'decisions.json.initialized',
  'instance.lock',
].map((name) => path.join(DATA_DIR, name));

const TOUCHED_SNAPSHOTS: Array<{ file: string; original: string | null }> = [];

function snapshotTouchedDataFiles(): void {
  for (const file of TOUCHED_DATA_FILES) {
    TOUCHED_SNAPSHOTS.push({
      file,
      original: fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null,
    });
  }
}

function restoreTouchedDataFiles(): void {
  for (const { file, original } of TOUCHED_SNAPSHOTS) {
    try {
      if (original !== null) {
        fs.writeFileSync(file, original, 'utf-8');
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {
      // best-effort restore
    }
  }
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('G4.1: COMPANY BRAIN SINGLE PATH VERIFICATION SUITE');
  console.log('======================================================\n');

  snapshotTouchedDataFiles();

  try {
    // ------------------------------------------------------------------
    // Group 1: Static Codebase Proof (No parallel state paths)
    // ------------------------------------------------------------------
    console.log('--- Group 1: Static Architectural Proof ---');

    await test('1.1. No parallel in-memory serverRecentIntelligence or serverCompanyMemory exist', async () => {
      const providerSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/server/context/company-context.ts'),
        'utf-8'
      );
      assert.ok(
        !providerSource.includes('let serverRecentIntelligence'),
        'Volatile module array serverRecentIntelligence must not exist'
      );
      assert.ok(
        !providerSource.includes('let serverEngineeringIntelligence'),
        'Volatile module variable serverEngineeringIntelligence must not exist'
      );
      assert.ok(
        !providerSource.includes('let serverCompanyMemory'),
        'Volatile module array serverCompanyMemory must not exist'
      );
      assert.ok(
        providerSource.includes('CompanyBrain.getInstance()'),
        'CompanyContextProvider must delegate directly to CompanyBrain'
      );
    });

    await test('1.2. GitHub tool provider records intelligence via CompanyBrain, not volatile globals', async () => {
      const githubSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/server/tools/providers/github.ts'),
        'utf-8'
      );
      assert.ok(
        githubSource.includes('CompanyBrain.getInstance().recordEngineeringIntelligence'),
        'GitHub tool must route engineering intelligence through CompanyBrain'
      );
    });

    await test('1.3. Sophia Context Assembler slice 1 reads from CompanyBrain', async () => {
      const assemblerSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/server/sophia/context-assembly.ts'),
        'utf-8'
      );
      assert.ok(
        assemblerSource.includes('CompanyBrain.getInstance()'),
        'Context assembly must read operational telemetry through CompanyBrain'
      );
    });

    // ------------------------------------------------------------------
    // Group 2: Runtime Operational State Authority
    // ------------------------------------------------------------------
    console.log('\n--- Group 2: Runtime Operational State Authority ---');

    await test('2.1. CompanyBrain singleton correctly persists and reads financial metrics', async () => {
      const brain = CompanyBrain.getInstance();
      const testMrr = 45000;
      const testBurn = 12000;

      await brain.updateFinancialMetrics({ mrr: testMrr, burnRate: testBurn });
      const readFin = await brain.getFinancialMetrics();

      assert.strictEqual(readFin.mrr, testMrr, 'MRR must be updated in brain');
      assert.strictEqual(readFin.burnRate, testBurn, 'Burn rate must be updated in brain');

      // Verify that CompanyContextProvider sees the exact same metrics
      const canonical = await CompanyContextProvider.getCanonicalContext();
      assert.strictEqual(canonical.financialModel.mrr, testMrr, 'Canonical context must reflect brain MRR');
    });

    await test('2.2. CompanyBrain updates propagate to Sophia slice 1 and greeting', async () => {
      const brain = CompanyBrain.getInstance();
      await brain.updateFinancialMetrics({ mrr: 55000, isSimulatedModel: false });

      // Sophia Slice 1 verification
      const assembled = await SophiaContextAssembler.assemble({ message: 'What is our MRR and operational standing?' });
      const opSlice = assembled.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
      assert.ok(opSlice, 'Operational state slice must exist');
      assert.ok(opSlice.content.includes('$55,000'), 'Slice 1 must contain updated MRR');
      assert.ok(opSlice.provenance.includes('CompanyBrain'), 'Slice 1 provenance must cite CompanyBrain');

      // Greeting verification
      const greeting = await getSofiaGreeting();
      assert.strictEqual(greeting.stateSummary.mrr, 55000, 'Greeting state summary must reflect brain MRR');
      assert.ok(greeting.sources.includes('CompanyBrain'), 'Greeting sources must cite CompanyBrain');
    });

    await test('2.3. CompanyBrain collection-locked updates for Products, Customers, and AttentionItems', async () => {
      const brain = CompanyBrain.getInstance();

      const testProducts: ProductFeature[] = [
        {
          id: 'prod-brain-g41',
          name: 'Company Brain OS',
          stage: 'active',
          description: 'Single authoritative read and write path for enterprise company state',
          leadAgent: 'Maya Lin',
          status: 'ready',
        },
      ];
      await brain.updateProducts(testProducts);
      const readProducts = await brain.getProducts();
      assert.ok(readProducts.some((p) => p.id === 'prod-brain-g41'), 'Product must be persisted');

      const testCustomers: CustomerDeal[] = [
        {
          id: 'cust-brain-g41',
          company: 'Acme AI Systems',
          mrr: 15000,
          stage: 'closed_won',
          probability: 100,
          healthScore: 98,
          leadAgent: 'Sophia Vance',
        },
      ];
      await brain.updateCustomers(testCustomers);
      const readCustomers = await brain.getCustomers();
      assert.ok(readCustomers.some((c) => c.id === 'cust-brain-g41'), 'Customer must be persisted');

      const testAttention: AttentionItem[] = [
        {
          id: 'att-brain-g41',
          type: 'decision',
          title: 'Ratify Company Brain as Single Path',
          whatHappened: 'All parallel state paths eliminated',
          whyItMatters: 'Guarantees zero-split-brain state operations',
          recommendedAction: 'Ratify architecture',
          urgency: 'high',
          status: 'pending',
          sourceSpecialist: 'Sophia Vance',
        },
      ];
      await brain.updateAttentionItems(testAttention);
      const readAttention = await brain.getAttentionItems();
      assert.ok(readAttention.some((a) => a.id === 'att-brain-g41'), 'Attention item must be persisted');
    });

    // ------------------------------------------------------------------
    // Group 3: Durable Intelligence & Process Restart Recovery
    // ------------------------------------------------------------------
    console.log('\n--- Group 3: Durable Intelligence & Process Restart ---');

    await test('3.1. Research intelligence recorded in CompanyBrain persists to disk and survives resetInstance', async () => {
      const brain = CompanyBrain.getInstance();

      const testTopic: ResearchTopic = {
        id: 'res-g41-brain',
        title: 'Unified Company Brain Verification',
        category: 'architecture',
        confidence: 99,
        impact: 'High',
        author: 'Dr. Aris Thorne',
        summary: 'Verifying single read/write path across all company operational state.',
        tags: ['brain', 'm3', 'g4.1'],
      };

      await brain.recordIntelligence(testTopic);
      const intBefore = await brain.getIntelligence();
      assert.ok(intBefore.some((t) => t.id === 'res-g41-brain'), 'Topic must be present before reset');

      // Simulate process restart
      CompanyBrain.resetInstance();
      const freshBrain = CompanyBrain.getInstance();
      const intAfter = await freshBrain.getIntelligence();
      assert.ok(
        intAfter.some((t) => t.id === 'res-g41-brain'),
        'Topic must be durably loaded from company_intelligence.json after process restart'
      );
    });

    await test('3.2. Engineering reconnaissance persists to disk and survives resetInstance', async () => {
      const brain = CompanyBrain.getInstance();
      const engData = {
        repositoryTarget: 'samjuniors/SamjuniorsOS',
        lastReconTimestamp: new Date().toISOString(),
        status: 'recon_verified',
        findingsSummary: 'G4.1 Company Brain single path verified',
      };

      await brain.recordEngineeringIntelligence(engData);

      // Simulate process restart
      CompanyBrain.resetInstance();
      const freshBrain = CompanyBrain.getInstance();
      const engAfter = await freshBrain.getEngineeringIntelligence();
      assert.strictEqual(engAfter?.findingsSummary, 'G4.1 Company Brain single path verified');
    });

    // ------------------------------------------------------------------
    // Group 4: Strict Personal Mind vs Company Brain Segregation
    // ------------------------------------------------------------------
    console.log('\n--- Group 4: Personal Mind vs Company Brain Segregation ---');

    await test('4.1. Personal memories are strictly isolated from Company Brain', async () => {
      const personalStore = SophiaMemoryStore.getInstance();
      const founderSecret = 'Founder prefers 7am daily executive briefings with dark mode';
      await personalStore.createMemory({
        founderId: 'founder-test-g41',
        memoryType: 'INTERACTION_PREFERENCE',
        content: founderSecret,
        provenance: 'founder_direct',
      });

      // Company Brain context assembly MUST NOT contain personal memory
      const canonical = await CompanyBrain.getInstance().getCanonicalContext();
      const serialized = JSON.stringify(canonical);
      assert.ok(
        !serialized.includes(founderSecret),
        'Company Brain canonical context must NEVER contain personal mind memories'
      );

      // ServerGateway company_metrics query MUST NOT cite personal store
      const gatewayResult = await SophiaServerGateway.process({
        proposal: {
          kind: 'informational_query',
          intent: 'query_company_metrics',
          domain: 'company_metrics',
          confidence: 0.95,
          extractedEntities: {},
        } as any,
        context: await SophiaContextAssembler.assemble({ message: 'What is our MRR?' }),
        session: { role: 'founder' },
        message: 'What is our MRR?',
      });

      assert.ok(
        !gatewayResult.scopes?.includes('personal_mind'),
        'Company metrics query must never include personal_mind scope'
      );
      assert.ok(
        gatewayResult.scopes?.includes('company_brain'),
        'Company metrics query must declare company_brain scope'
      );
      assert.ok(
        gatewayResult.sources?.some((s) => s.includes('CompanyBrain')),
        'Company metrics query must cite CompanyBrain'
      );
    });

  } finally {
    restoreTouchedDataFiles();
    CompanyBrain.resetInstance();
  }

  console.log('\n======================================================');
  console.log(`G4.1 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
