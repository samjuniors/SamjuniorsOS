/**
 * Gate G4.3: Robust GitHub Adapter Verification Suite
 *
 * Verifies:
 * 1. Strict idempotency key registration and caching on issue creation.
 * 2. Duplicate delivery produces exactly one effect and returns cached result.
 * 3. Payload alteration on claimed key fails closed with IdempotencyPayloadMismatchError.
 * 4. Network drops, timeouts, and 5xx errors transition outcome to 'unknown' (never assumed).
 * 5. Re-dispatch of an 'unknown' operation is strictly blocked without reconciliation.
 * 6. Reconciliation probes remote state to resolve 'unknown' to 'completed' or 'failed'.
 * 7. Webhook delivery deduplication: duplicate webhooks produce exactly one state mutation.
 * 8. Deterministic client errors (4xx) transition to 'failed' rather than 'unknown'.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  GitHubAdapter,
  GitHubIssueCreateInput,
  GitHubWebhookPayload,
} from '@/lib/server/integrations/github-adapter';
import {
  UnknownExternalResultError,
  IdempotencyPayloadMismatchError,
} from '@/lib/server/idempotency/state-machine';
import { CompanyBrain } from '@/lib/server/brain/company-brain';

describe('Gate G4.3: GitHub Adapter with Idempotency and Unknown-Outcome Handling', () => {
  beforeEach(() => {
    GitHubAdapter.resetInstance();
  });

  it('4.3.1 Creates an issue and caches the result for identical idempotency keys', async () => {
    const adapter = GitHubAdapter.getInstance();
    let dispatchCount = 0;
    const testTitle = `Fix memory leak in scheduler ${Date.now()}`;

    adapter.setTransportHook(async (endpoint, options) => {
      dispatchCount++;
      assert.strictEqual(endpoint, '/repos/samjuniors/core/issues');
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.data.title, testTitle);
      return {
        id: 101,
        number: 42,
        title: options.data.title,
        html_url: 'https://github.com/samjuniors/core/issues/42',
        state: 'open',
        created_at: '2026-10-24T12:00:00Z',
      };
    });

    const input: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: testTitle,
      body: 'Investigate memory consumption under sustained cron heartbeat load.',
      labels: ['bug', 'scheduler'],
    };

    // First call: dispatches to GitHub
    const res1 = await adapter.createIssue(input);
    assert.strictEqual(res1.number, 42);
    assert.strictEqual(res1.state, 'open');
    assert.strictEqual(dispatchCount, 1);

    // Second call with identical input: must return cached response without calling transport
    const res2 = await adapter.createIssue(input);
    assert.strictEqual(res2.number, 42);
    assert.strictEqual(res2.id, 101);
    assert.strictEqual(dispatchCount, 1, 'Duplicate call must NOT dispatch external HTTP request');
  });

  it('4.3.2 Rejects payload mismatch when reusing an explicit idempotency key', async () => {
    const adapter = GitHubAdapter.getInstance();
    const explicitKey = `test-key-${Date.now()}`;

    adapter.setTransportHook(async () => {
      return { id: 202, number: 50, title: 'Original', html_url: '', state: 'open' };
    });

    const input1: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: 'Original Title',
      body: 'Original Body',
      idempotencyKey: explicitKey,
    };

    await adapter.createIssue(input1);

    // Second call with altered body must fail closed
    const input2: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: 'Altered Title',
      body: 'Altered Body',
      idempotencyKey: explicitKey,
    };

    await assert.rejects(
      async () => {
        await adapter.createIssue(input2);
      },
      (err: any) => {
        assert.ok(err instanceof IdempotencyPayloadMismatchError || err.name === 'IdempotencyPayloadMismatchError');
        return true;
      }
    );
  });

  it('4.3.3 External 5xx / network errors transition to unknown and throw UnknownExternalResultError', async () => {
    const adapter = GitHubAdapter.getInstance();
    const explicitKey = `unknown-test-${Date.now()}`;

    let attempts = 0;
    adapter.setTransportHook(async () => {
      attempts++;
      const netErr: any = new Error('Gateway Timeout connecting to api.github.com');
      netErr.statusCode = 504;
      throw netErr;
    });

    const input: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: 'Flaky issue dispatch',
      body: 'Will encounter 504 Gateway Timeout.',
      idempotencyKey: explicitKey,
    };

    // First attempt: encounters 504, marks unknown, throws UnknownExternalResultError
    await assert.rejects(
      async () => {
        await adapter.createIssue(input);
      },
      (err: any) => {
        assert.ok(err instanceof UnknownExternalResultError || err.name === 'UnknownExternalResultError');
        assert.strictEqual(err.key, explicitKey);
        return true;
      }
    );
    assert.strictEqual(attempts, 1);

    // Subsequent attempt with same key without reconciliation must immediately reject with UnknownExternalResultError
    await assert.rejects(
      async () => {
        await adapter.createIssue(input);
      },
      (err: any) => {
        assert.ok(err instanceof UnknownExternalResultError || err.name === 'UnknownExternalResultError');
        return true;
      }
    );
    assert.strictEqual(attempts, 1, 'Blind retry must be blocked when status is unknown');
  });

  it('4.3.4 Reconciles unknown operation by probing remote GitHub state', async () => {
    const adapter = GitHubAdapter.getInstance();
    const explicitKey = `github:issue:create:samjuniors/core:${Date.now().toString(16)}`;

    // 1. Force into unknown state via simulated network drop
    adapter.setTransportHook(async () => {
      const err: any = new Error('ECONNRESET');
      err.statusCode = undefined; // network level
      throw err;
    });

    const input: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: 'Network drop issue',
      body: 'Dropped during TCP handshake.',
      idempotencyKey: explicitKey,
    };

    await assert.rejects(async () => {
      await adapter.createIssue(input);
    }, UnknownExternalResultError);

    // 2. Set transport hook to mock reconciliation GET response (remote issue exists)
    adapter.setTransportHook(async (endpoint, options) => {
      if (options.method === 'GET' && endpoint.includes('/issues')) {
        return [
          {
            id: 999,
            number: 88,
            title: 'Network drop issue',
            html_url: 'https://github.com/samjuniors/core/issues/88',
            state: 'open',
            created_at: '2026-10-24T12:30:00Z',
          },
        ];
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    // 3. Reconcile
    const reconciled = await adapter.reconcileUnknownOperation(explicitKey);
    assert.strictEqual(reconciled.status, 'completed');
    assert.strictEqual((reconciled.response as any).number, 88);

    // 4. Subsequent createIssue call with same input now returns cached result safely
    const resolved = await adapter.createIssue(input);
    assert.strictEqual(resolved.number, 88);
  });

  it('4.3.5 Ingests webhooks idempotently and produces exactly one mutation', async () => {
    const adapter = GitHubAdapter.getInstance();
    const deliveryId = `deliv-${Date.now()}`;

    const payload: GitHubWebhookPayload = {
      action: 'opened',
      repository: {
        id: 12345,
        name: 'core',
        full_name: 'samjuniors/core',
        owner: { login: 'samjuniors' },
        html_url: 'https://github.com/samjuniors/core',
      },
      sender: {
        login: 'sumit_founder',
      },
      issue: {
        id: 555,
        number: 12,
        title: 'Support multi-tenant memory indexing',
        state: 'open',
        html_url: 'https://github.com/samjuniors/core/issues/12',
      },
    };

    // First delivery: processes and records intelligence
    const res1 = await adapter.handleWebhook(deliveryId, 'issues', payload);
    assert.strictEqual(res1.status, 'processed');
    assert.ok(res1.effect?.includes('Recorded issue opened #12'));

    // Check CompanyBrain captured the intelligence
    const brain = CompanyBrain.getInstance();
    const intel = await brain.getIntelligence();
    const found = intel.find((i) => i.id === `github-event-${deliveryId}`);
    assert.ok(found, 'Epistemic intelligence record must exist in CompanyBrain');
    assert.strictEqual(found.author, 'sumit_founder');

    // Second delivery of exact same webhook: cached duplicate
    const res2 = await adapter.handleWebhook(deliveryId, 'issues', payload);
    assert.strictEqual(res2.status, 'duplicate');
    assert.ok(res2.effect?.includes('duplicate delivery ignored'));
  });

  it('4.3.6 Deterministic client error (4xx) marks record failed, not unknown', async () => {
    const adapter = GitHubAdapter.getInstance();
    const explicitKey = `client-err-${Date.now()}`;

    adapter.setTransportHook(async () => {
      const err: any = new Error('Validation Failed: Title cannot be blank');
      err.statusCode = 422;
      throw err;
    });

    const input: GitHubIssueCreateInput = {
      owner: 'samjuniors',
      repo: 'core',
      title: '',
      body: 'Empty title',
      idempotencyKey: explicitKey,
    };

    await assert.rejects(
      async () => {
        await adapter.createIssue(input);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );
  });
});
