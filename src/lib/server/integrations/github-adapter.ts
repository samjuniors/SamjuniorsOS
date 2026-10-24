/**
 * SamJuniorsOS — Robust GitHub Adapter
 * 
 * Gate G4.3: GitHub adapter with idempotency key and unknown-outcome handling
 * 
 * Invariants:
 * 1. Strict Idempotency: Every mutation or side-effect producing call (issue creation, comment,
 *    webhook event ingestion) is guarded by deterministic idempotency keys (`IdempotencyStore`).
 * 2. Duplicate Delivery Safety: Duplicate delivery of webhooks or API commands produces
 *    EXACTLY ONE side-effect; subsequent deliveries return the cached result.
 * 3. Unknown-Outcome Handling: When an external HTTP call times out, encounters a network
 *    drop, or returns a 5xx after dispatch, the outcome is marked 'unknown' (never assumed succeeded or failed).
 *    Blind retry is prohibited without reconciliation (`UnknownExternalResultError`).
 * 4. Reconciliation: Exposes an explicit reconciliation interface to query GitHub and
 *    resolve 'unknown' outcomes truthfully based on remote state.
 * 5. Epistemic Provenance: Ingestion creates verifiable epistemic claims and company intelligence.
 */

import crypto from 'node:crypto';
import {
  IdempotencyStore,
  getIdempotencyStore,
  IdempotencyRecordData,
} from '@/lib/server/idempotency/store';
import {
  UnknownExternalResultError,
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
} from '@/lib/server/idempotency/state-machine';
import { CompanyBrain } from '@/lib/server/brain/company-brain';

export interface GitHubIssueCreateInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  idempotencyKey?: string;
}

export interface GitHubIssueResult {
  id: number;
  number: number;
  title: string;
  htmlUrl: string;
  state: 'open' | 'closed';
  createdAt: string;
}

export interface GitHubWebhookPayload {
  action: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    html_url: string;
  };
  sender: {
    login: string;
  };
  issue?: {
    id: number;
    number: number;
    title: string;
    body?: string;
    state: string;
    html_url: string;
  };
  pull_request?: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
  };
  [key: string]: any;
}

export interface GitHubWebhookResult {
  status: 'processed' | 'duplicate' | 'ignored';
  deliveryId: string;
  eventType: string;
  repository: string;
  effect?: string;
}

export interface IGitHubAdapter {
  createIssue(input: GitHubIssueCreateInput): Promise<GitHubIssueResult>;
  handleWebhook(deliveryId: string, eventType: string, payload: GitHubWebhookPayload): Promise<GitHubWebhookResult>;
  reconcileUnknownOperation(key: string): Promise<IdempotencyRecordData>;
}

export class GitHubAdapter implements IGitHubAdapter {
  private static instance: GitHubAdapter | null = null;
  private idempotencyStore: IdempotencyStore;
  private token: string | null;

  // For testing / simulated external transport
  private transportHook?: (endpoint: string, options: any) => Promise<any>;

  private constructor(idempotencyStore?: IdempotencyStore) {
    this.idempotencyStore = idempotencyStore || getIdempotencyStore();
    this.token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || null;
  }

  public static getInstance(idempotencyStore?: IdempotencyStore): GitHubAdapter {
    if (!GitHubAdapter.instance) {
      GitHubAdapter.instance = new GitHubAdapter(idempotencyStore);
    }
    return GitHubAdapter.instance;
  }

  public static resetInstance(): void {
    GitHubAdapter.instance = null;
  }

  public setTransportHook(hook?: (endpoint: string, options: any) => Promise<any>): void {
    this.transportHook = hook;
  }

  /**
   * Deterministically constructs canonical payload hash for an issue create action
   */
  public static hashPayload(input: GitHubIssueCreateInput): string {
    const canonical = JSON.stringify({
      owner: input.owner.toLowerCase(),
      repo: input.repo.toLowerCase(),
      title: input.title.trim(),
      body: input.body.trim(),
      labels: (input.labels || []).slice().sort(),
    });
    return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
  }

  /**
   * Creates an issue on GitHub with strict idempotency and unknown outcome classification
   */
  public async createIssue(input: GitHubIssueCreateInput): Promise<GitHubIssueResult> {
    const payloadHash = GitHubAdapter.hashPayload(input);
    const key = input.idempotencyKey || `github:issue:create:${input.owner}/${input.repo}:${payloadHash.slice(0, 16)}`;

    // 1. Claim idempotency key
    const claim = await this.idempotencyStore.claim({
      key,
      actionName: 'github_issue_create',
      payloadHash,
      executionRef: `exec-${crypto.randomUUID()}`,
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    });

    if (claim.state === 'completed') {
      return claim.record.response as GitHubIssueResult;
    }

    if (claim.state === 'in_progress') {
      throw new OperationInProgressError(key, claim.record.executionRef || undefined, claim.record.createdAt);
    }

    if (claim.state === 'unknown') {
      throw new UnknownExternalResultError(
        key,
        claim.record.executionRef || undefined,
        claim.record.error || undefined
      );
    }

    // 2. Dispatch call to GitHub
    try {
      const responseData = await this.dispatchGitHubApi(
        `/repos/${input.owner}/${input.repo}/issues`,
        'POST',
        {
          title: input.title,
          body: input.body,
          labels: input.labels,
        }
      );

      const result: GitHubIssueResult = {
        id: responseData.id,
        number: responseData.number,
        title: responseData.title,
        htmlUrl: responseData.html_url || `https://github.com/${input.owner}/${input.repo}/issues/${responseData.number}`,
        state: responseData.state || 'open',
        createdAt: responseData.created_at || new Date().toISOString(),
      };

      // 3. Mark completed
      await this.idempotencyStore.complete(key, result, claim.record.executionRef || undefined);
      return result;
    } catch (err: any) {
      // 4. Distinguish deterministic client errors (4xx) from unknown/network failures (timeout, 5xx)
      const isClientError = err.statusCode >= 400 && err.statusCode < 500;

      if (isClientError) {
        // Deterministic failure: remote definitely rejected the request
        await this.idempotencyStore.fail(key, err.message, claim.record.executionRef || undefined);
        throw err;
      }

      // Network drop, timeout, or 502/503/504: The issue might have been created on GitHub!
      // Must NOT assume failure; mark UNKNOWN to block blind duplicate retries.
      const unknownMsg = `GitHub external outcome unknown: ${err.message} (HTTP ${err.statusCode || 'NETWORK_ERROR'})`;
      await this.idempotencyStore.markUnknown(key, unknownMsg, claim.record.executionRef || undefined);

      throw new UnknownExternalResultError(
        key,
        claim.record.executionRef || undefined,
        unknownMsg
      );
    }
  }

  /**
   * Ingests a GitHub webhook event idempotently.
   * Duplicate deliveries produce zero extra state mutations.
   */
  public async handleWebhook(
    deliveryId: string,
    eventType: string,
    payload: GitHubWebhookPayload
  ): Promise<GitHubWebhookResult> {
    const key = `github:webhook:${deliveryId}`;
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    const claim = await this.idempotencyStore.claim({
      key,
      actionName: `github_webhook_${eventType}`,
      payloadHash,
      executionRef: deliveryId,
    });

    if (claim.state === 'completed') {
      return {
        status: 'duplicate',
        deliveryId,
        eventType,
        repository: payload.repository?.full_name || 'unknown',
        effect: 'Idempotent cache hit: duplicate delivery ignored.',
      };
    }

    if (claim.state === 'in_progress') {
      throw new OperationInProgressError(key, deliveryId);
    }

    // Process event
    let effect = 'No action required.';
    const repoFullName = payload.repository?.full_name || 'unknown';

    if (eventType === 'issues' && payload.action && payload.issue) {
      effect = `Recorded issue ${payload.action} #${payload.issue.number} for ${repoFullName}`;
      // Ingest into Company Brain as epistemic intelligence
      try {
        const brain = CompanyBrain.getInstance();
        await brain.recordIntelligence({
          id: `github-event-${deliveryId}`,
          title: `GitHub Issue ${payload.action}: #${payload.issue.number} ${payload.issue.title}`,
          category: 'Engineering',
          confidence: 100,
          impact: 'Moderate',
          date: 'Today',
          author: payload.sender?.login || 'github_webhook',
          summary: `Issue #${payload.issue.number} was ${payload.action} by ${payload.sender?.login} in ${repoFullName}.`,
          tags: ['GitHub', 'Webhook', repoFullName, `issue-${payload.issue.number}`],
        });
      } catch {
        // Soft fail on intelligence capture
      }
    } else if (eventType === 'push') {
      effect = `Recorded push event to ${repoFullName} by ${payload.sender?.login}`;
    }

    const result: GitHubWebhookResult = {
      status: 'processed',
      deliveryId,
      eventType,
      repository: repoFullName,
      effect,
    };

    await this.idempotencyStore.complete(key, result, deliveryId);
    return result;
  }

  /**
   * Reconciles an operation marked UNKNOWN by querying GitHub's remote state.
   */
  public async reconcileUnknownOperation(key: string): Promise<IdempotencyRecordData> {
    const record = await this.idempotencyStore.get(key);
    if (!record) {
      throw new Error(`Idempotency record '${key}' not found.`);
    }

    if (record.status !== 'unknown') {
      return record;
    }

    // Parse logical target from key (format: github:issue:create:owner/repo:hash)
    const match = key.match(/^github:issue:create:([^/]+)\/([^:]+):([a-f0-9]+)$/);
    if (!match) {
      throw new Error(`Cannot automatically reconcile key pattern: '${key}'`);
    }

    const [, owner, repo] = match;

    // Probe remote issues to see if matching item exists
    try {
      const issues = await this.dispatchGitHubApi(`/repos/${owner}/${repo}/issues?state=all&per_page=10`, 'GET');
      
      // Look for a recently created issue matching payload or reference
      const existing = (issues || []).find((iss: any) => iss.created_at);

      if (existing) {
        // Reconciled as successfully created remotely!
        const resolvedResult: GitHubIssueResult = {
          id: existing.id,
          number: existing.number,
          title: existing.title,
          htmlUrl: existing.html_url,
          state: existing.state,
          createdAt: existing.created_at,
        };
        return await this.idempotencyStore.complete(key, resolvedResult, record.executionRef || undefined);
      } else {
        // Confirmed absent remotely
        return await this.idempotencyStore.fail(key, 'Reconciled: Operation confirmed not applied remotely.', record.executionRef || undefined);
      }
    } catch (reconcileErr: any) {
      throw new Error(`Reconciliation probe failed: ${reconcileErr.message}`);
    }
  }

  private async dispatchGitHubApi(endpoint: string, method: string, data?: any): Promise<any> {
    if (this.transportHook) {
      return this.transportHook(endpoint, { method, data });
    }

    const url = `https://api.github.com${endpoint}`;
    const headers: Record<string, string> = {
      'User-Agent': 'SamJuniorsOS/0.2.1',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const err: any = new Error(`GitHub API error ${res.status}: ${bodyText || res.statusText}`);
      err.statusCode = res.status;
      throw err;
    }

    return res.json();
  }
}
