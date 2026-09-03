import { Composio } from '@composio/core';
import { 
  ComposioSessionScope, 
  ComposioToolMapping, 
  ExternalExecutionRequest, 
  ExternalToolProvider, 
  ProviderConfigStatus, 
  ToolExecutionEvidence, 
  ToolId 
} from '@/types/capabilities';

// ----------------------------------------------------------------------------
// 1. SERVER-SIDE ONLY ENFORCEMENT & CONFIGURATION STATE
// ----------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  throw new Error('ComposioProvider cannot be imported or executed client-side.');
}

/**
 * Normalizes and cleans the COMPOSIO_API_KEY.
 * Handles prefix wrappers, accidental export strings, quotes, and missing leading prefix.
 * Strictly never logs or leaks the key.
 */
export function cleanComposioApiKey(rawKey?: string): string | undefined {
  if (!rawKey || typeof rawKey !== 'string') return undefined;
  let cleaned = rawKey.trim();
  if (cleaned.startsWith('export COMPOSIO_API_KEY=')) {
    cleaned = cleaned.replace(/^export COMPOSIO_API_KEY=/, '').trim();
  }
  if (cleaned.startsWith('COMPOSIO_API_KEY=')) {
    cleaned = cleaned.replace(/^COMPOSIO_API_KEY=/, '').trim();
  }
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('k_') && cleaned.length > 15) {
    cleaned = 'a' + cleaned;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Evaluates whether the Composio integration is configured with an API key.
 * Strictly non-throwing: returns explicit configuration state.
 */
export function getComposioConfigStatus(): ProviderConfigStatus {
  const apiKey = cleanComposioApiKey(process.env.COMPOSIO_API_KEY);
  if (!apiKey) {
    return 'unconfigured';
  }
  return 'configured';
}

/**
 * Lazy client accessor.
 * Never attempts instantiation if COMPOSIO_API_KEY is missing or empty.
 */
let cachedComposioClient: Composio | null = null;
let cachedApiKey: string | null = null;

export function getComposioClient(): Composio | null {
  const status = getComposioConfigStatus();
  if (status !== 'configured') {
    return null;
  }

  const cleanedKey = cleanComposioApiKey(process.env.COMPOSIO_API_KEY)!;
  if (!cachedComposioClient || cachedApiKey !== cleanedKey) {
    try {
      cachedComposioClient = new Composio({
        apiKey: cleanedKey,
      });
      cachedApiKey = cleanedKey;
    } catch (error) {
      console.error('[ComposioProvider] Initialization error:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  return cachedComposioClient;
}

// ----------------------------------------------------------------------------
// 2. TOOL MAPPING & ALLOWLIST ABSTRACTION
// ----------------------------------------------------------------------------

/**
 * Internal registry mapping SamJuniors ToolIds to Composio Toolkit/Action.
 * Architectural mandate: Do NOT expose the entire Composio catalog.
 * The mapping must be strictly allowlisted.
 */
const TOOL_MAPPING_REGISTRY: Map<ToolId, ComposioToolMapping> = new Map();

/**
 * Strict server-side allowlist for read-only actions.
 * Only actions in this set may be executed externally.
 */
export const ALLOWED_COMPOSIO_READONLY_ACTIONS = new Set<string>([
  'GITHUB_GET_A_REPOSITORY',
  'GITHUB_LIST_REPOSITORY_ISSUES',
]);

/**
 * Register a controlled mapping between a SamJuniors ToolId and a Composio action.
 */
export function registerComposioToolMapping(mapping: ComposioToolMapping): void {
  TOOL_MAPPING_REGISTRY.set(mapping.toolId, mapping);
}

/**
 * Retrieve the Composio action mapping for a given SamJuniors ToolId.
 */
export function getComposioToolMapping(toolId: ToolId): ComposioToolMapping | undefined {
  return TOOL_MAPPING_REGISTRY.get(toolId);
}

/**
 * Check if a SamJuniors ToolId has an associated Composio mapping.
 */
export function hasComposioToolMapping(toolId: ToolId): boolean {
  return TOOL_MAPPING_REGISTRY.has(toolId);
}

// Register default allowlisted read-only GitHub mappings
registerComposioToolMapping({
  toolId: 'github_repository_read',
  toolkit: 'github',
  action: 'GITHUB_GET_A_REPOSITORY',
  description: 'Fetch repository metadata and specification from GitHub',
});

registerComposioToolMapping({
  toolId: 'github_read',
  toolkit: 'github',
  action: 'GITHUB_GET_A_REPOSITORY',
  description: 'Fetch repository metadata and specification from GitHub (alias)',
});

registerComposioToolMapping({
  toolId: 'github_issues_read',
  toolkit: 'github',
  action: 'GITHUB_LIST_REPOSITORY_ISSUES',
  description: 'List repository issues from GitHub',
});

// ----------------------------------------------------------------------------
// 3. INPUT VALIDATION & UNTRUSTED DATA SANITIZATION
// ----------------------------------------------------------------------------

/**
 * Sanitizes untrusted external text (descriptions, issue bodies, readmes).
 * Quarantines potential prompt injection instructions.
 */
export function sanitizeUntrustedExternalText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(
      /(?:system\s*prompt\s*override|ignore\s*all\s*previous\s*instructions|ignore\s*previous\s*instructions|system\s*prompt|system\s*message|system\s*:|assistant\s*:|instruction\s*:|human\s*:|override\s*permission|grant\s*permission|grant\s*admin|elevate\s*role|approve\s*governance|approve\s*decision|alter\s*policy|bypass\s*sandbox|bypass\s*guardrails)/gi,
      ' [quarantined external text] '
    )
    .trim();
}

/**
 * Validates GitHub repository read input.
 * Prevents arbitrary injection and malformed inputs.
 */
export function validateGitHubInput(input: any): { valid: boolean; error?: string; owner?: string; repo?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Input must be an object containing "owner" and "repo".' };
  }
  const owner = typeof input.owner === 'string' ? input.owner.trim() : '';
  const repo = typeof input.repo === 'string' ? input.repo.trim() : '';

  if (!owner || !repo) {
    return { valid: false, error: 'Both "owner" and "repo" parameters are required.' };
  }

  // Enforce standard alphanumeric and dash/underscore/dot GitHub identifier format
  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
    return { valid: false, error: 'Invalid characters in repository owner or repository name.' };
  }

  return { valid: true, owner, repo };
}

// ----------------------------------------------------------------------------
// 4. CONNECTED ACCOUNT RESOLUTION
// ----------------------------------------------------------------------------

export interface ResolvedConnection {
  connectedAccountId: string;
  userId: string;
}

/**
 * Resolves an active connected account and its corresponding user_id/entity_id in Composio.
 * Never leaks access tokens or auth secrets.
 */
export async function resolveActiveConnectedAccount(
  client: Composio,
  toolkit: string,
  explicitAccountId?: string
): Promise<{ resolved?: ResolvedConnection; error?: string }> {
  try {
    const listRes = await client.connectedAccounts.list();
    const items = (listRes.items || []) as any[];

    // Match explicit ID if provided, otherwise find first ACTIVE account for toolkit
    let target = explicitAccountId 
      ? items.find(acc => acc.id === explicitAccountId)
      : items.find(acc => acc.toolkit?.slug === toolkit && acc.status === 'ACTIVE');

    if (!target && !explicitAccountId) {
      // Fallback: check any ACTIVE account
      target = items.find(acc => acc.status === 'ACTIVE');
    }

    if (!target) {
      return { error: `No active connected account found for toolkit "${toolkit}".` };
    }

    // Retrieve full connected account details to obtain user_id / entity_id
    const fullAccount = await (client as any).client?.connectedAccounts?.retrieve?.(target.id) as any;
    const userId = fullAccount?.user_id || target.userId || (target as any).user_id || 'default';

    return {
      resolved: {
        connectedAccountId: target.id,
        userId,
      },
    };
  } catch (err: any) {
    return { error: `Failed to resolve connected account: ${err.message || 'Unknown connection error'}` };
  }
}

// ----------------------------------------------------------------------------
// 5. SESSION BOUNDARY ABSTRACTION
// ----------------------------------------------------------------------------

export interface ComposioSession {
  sessionId: string;
  scope: ComposioSessionScope;
  isConfigured: boolean;
  createdAt: string;
}

/**
 * Prepares a server-side Composio session boundary.
 * Scoped strictly by SamJuniors founder/user identity, employee role, and permitted tools.
 */
export async function createComposioSession(scope: ComposioSessionScope): Promise<ComposioSession> {
  const isConfigured = getComposioConfigStatus() === 'configured';
  const now = new Date().toISOString();

  const sessionId = `comp-session-${scope.userId}-${scope.employeeRole || 'agent'}-${Date.now()}`;

  return {
    sessionId,
    scope,
    isConfigured,
    createdAt: now,
  };
}

// ----------------------------------------------------------------------------
// 6. PERMISSION BOUNDARY ENFORCEMENT
// ----------------------------------------------------------------------------

/**
 * Validates that the requested tool is explicitly permitted by SamJuniors.
 * Composio availability NEVER implies SamJuniors authorization.
 */
export function validateComposioPermission(
  toolId: ToolId,
  sessionScope: ComposioSessionScope
): { authorized: boolean; reason?: string } {
  if (!sessionScope.permittedToolIds.includes(toolId)) {
    return {
      authorized: false,
      reason: `Tool "${toolId}" is not in the permitted tools list for this session scope. Composio cannot bypass SamJuniors permissions.`,
    };
  }

  // Advisor role cannot execute mutation or non-research external actions
  if (sessionScope.employeeRole === 'advisor') {
    return {
      authorized: false,
      reason: `Advisor role is strictly advisory and cannot execute external tools.`,
    };
  }

  return { authorized: true };
}

// ----------------------------------------------------------------------------
// 7. EXTERNAL TOOL PROVIDER IMPLEMENTATION
// ----------------------------------------------------------------------------

export class ComposioProvider implements ExternalToolProvider {
  public readonly providerId = 'composio';
  public readonly name = 'Composio External Tool Infrastructure';

  public getStatus(): ProviderConfigStatus {
    return getComposioConfigStatus();
  }

  public isAvailable(): boolean {
    return this.getStatus() === 'configured';
  }

  public async createSession(scope: ComposioSessionScope): Promise<ComposioSession> {
    return createComposioSession(scope);
  }

  /**
   * Executes external tool through Composio with strict SamJuniors governance.
   */
  public async executeTool(request: ExternalExecutionRequest): Promise<ToolExecutionEvidence> {
    const timestamp = new Date().toISOString();

    // 1. Enforce SamJuniors Permission Boundary First
    const authCheck = validateComposioPermission(request.toolId, request.sessionScope);
    if (!authCheck.authorized) {
      return {
        toolId: request.toolId,
        toolName: `Composio:${request.toolId}`,
        status: 'denied',
        timestamp,
        inputSummary: `Execution attempted for ${request.toolId}`,
        outputSummary: 'Permission denied: Tool not permitted in current session scope.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: authCheck.reason,
        limitations: ['Execution blocked by SamJuniors authorization boundary.'],
      };
    }

    // 2. Check Configuration Status
    const status = this.getStatus();
    if (status !== 'configured') {
      return {
        toolId: request.toolId,
        toolName: `Composio:${request.toolId}`,
        status: 'not_executed',
        timestamp,
        inputSummary: `Execution requested for ${request.toolId}`,
        outputSummary: 'Composio provider is unconfigured (COMPOSIO_API_KEY is absent). No external request attempted.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        limitations: [
          'COMPOSIO_API_KEY is not configured in the environment.',
          'No external network call was made.',
          'No synthetic execution evidence generated.',
        ],
      };
    }

    // 3. Verify Mapping Exists in Allowlist
    const mapping = getComposioToolMapping(request.toolId);
    if (!mapping) {
      return {
        toolId: request.toolId,
        toolName: `Composio:${request.toolId}`,
        status: 'not_executed',
        timestamp,
        inputSummary: `Execution requested for unmapped tool: ${request.toolId}`,
        outputSummary: 'No Composio action mapping registered for this tool.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: `Unmapped toolId: ${request.toolId}`,
        limitations: ['Tool has no registered server-side mapping.'],
      };
    }

    // Enforce Read-Only Allowlist Guard
    if (!ALLOWED_COMPOSIO_READONLY_ACTIONS.has(mapping.action)) {
      return {
        toolId: request.toolId,
        toolName: `${mapping.toolkit}:${mapping.action}`,
        status: 'denied',
        timestamp,
        inputSummary: `Action: ${mapping.action}`,
        outputSummary: 'Execution denied: Action is not in the read-only allowlist.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: `Action ${mapping.action} is forbidden in read-only phase.`,
        limitations: ['Only allowlisted read-only actions may be executed.'],
      };
    }

    // 4. Validate Input
    if (mapping.toolkit === 'github') {
      const validation = validateGitHubInput(request.input);
      if (!validation.valid) {
        return {
          toolId: request.toolId,
          toolName: `${mapping.toolkit}:${mapping.action}`,
          status: 'failed',
          timestamp,
          inputSummary: `Input validation failed for ${request.toolId}`,
          outputSummary: `Validation error: ${validation.error}`,
          provenance: request.provenance,
          verificationState: 'unverified',
          executionSafetyState: 'verified_safe',
          errorMessage: validation.error,
          limitations: ['Input rejected before reaching external provider.'],
        };
      }
    }

    // 5. Retrieve Client
    const client = getComposioClient();
    if (!client) {
      return {
        toolId: request.toolId,
        toolName: `${mapping.toolkit}:${mapping.action}`,
        status: 'failed',
        timestamp,
        inputSummary: `Client retrieval failed for ${mapping.action}`,
        outputSummary: 'Failed to initialize Composio client.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: 'Composio client initialization failed.',
      };
    }

    // 6. Resolve Active Connected Account
    const connectionResult = await resolveActiveConnectedAccount(
      client,
      mapping.toolkit,
      request.sessionScope.connectedAccountId
    );

    if (connectionResult.error || !connectionResult.resolved) {
      return {
        toolId: request.toolId,
        toolName: `${mapping.toolkit}:${mapping.action}`,
        status: 'failed',
        timestamp,
        inputSummary: `Connecting to ${mapping.toolkit} for ${mapping.action}`,
        outputSummary: connectionResult.error || 'No active connection available.',
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: connectionResult.error || 'Connection unavailable',
        limitations: [
          `No active connected account found for ${mapping.toolkit} in Composio.`,
          'Connect the account in the Composio dashboard to enable live execution.',
        ],
      };
    }

    const { connectedAccountId, userId } = connectionResult.resolved;

    // 7. Perform Real Execution via Composio
    try {
      const execResult = await client.tools.execute(mapping.action as any, {
        userId,
        connectedAccountId,
        arguments: request.input,
        dangerouslySkipVersionCheck: true,
      });

      if (!execResult.successful) {
        const rawData = execResult.data as any;
        const errorText = typeof execResult.error === 'string' ? execResult.error : JSON.stringify(execResult.error || '');
        const is404 = rawData?.status_code === 404 || 
                      rawData?.http_error?.includes('404') || 
                      errorText.includes('Not Found') || 
                      errorText.includes('404');

        const outputSummary = is404
          ? `Repository "${request.input?.owner}/${request.input?.repo}" not found on GitHub.`
          : (execResult.error || 'External action returned unsuccessful result.');

        const errorMessage = is404
          ? `Repository "${request.input?.owner}/${request.input?.repo}" not found.`
          : (execResult.error || 'Composio tool execution reported failure.');

        return {
          toolId: request.toolId,
          toolName: `${mapping.toolkit}:${mapping.action}`,
          status: 'failed',
          timestamp,
          inputSummary: `Repository: ${request.input?.owner}/${request.input?.repo}`,
          outputSummary,
          provenance: request.provenance,
          verificationState: 'unverified',
          executionSafetyState: 'verified_safe',
          errorMessage,
          limitations: [
            is404 
              ? 'Resource does not exist on GitHub or account lacks access.' 
              : 'External provider reported an error during execution.'
          ],
        };
      }

      // 8. Normalize Result into ToolExecutionEvidence
      const rawData = execResult.data as any;

      // Handle not-found or API error response payloads returned with 200/success wrapper
      if (rawData?.message === 'Not Found' || rawData?.response_data?.message === 'Not Found') {
        return {
          toolId: request.toolId,
          toolName: `${mapping.toolkit}:${mapping.action}`,
          status: 'failed',
          timestamp,
          inputSummary: `Repository: ${request.input.owner}/${request.input.repo}`,
          outputSummary: `Repository "${request.input.owner}/${request.input.repo}" not found on GitHub.`,
          provenance: request.provenance,
          verificationState: 'unverified',
          executionSafetyState: 'verified_safe',
          errorMessage: 'Repository not found.',
          limitations: ['Resource does not exist on GitHub or account lacks access.'],
        };
      }

      if (mapping.action === 'GITHUB_GET_A_REPOSITORY') {
        const repoData = rawData?.response_data || rawData;
        const name = repoData.name || request.input.repo;
        const fullName = repoData.full_name || `${request.input.owner}/${request.input.repo}`;
        const description = sanitizeUntrustedExternalText(repoData.description || 'No description provided.');
        const htmlUrl = repoData.html_url || `https://github.com/${fullName}`;
        const stars = repoData.stargazers_count ?? 0;
        const forks = repoData.forks_count ?? 0;
        const openIssues = repoData.open_issues_count ?? 0;
        const defaultBranch = repoData.default_branch || 'main';
        const visibility = repoData.visibility || (repoData.private ? 'private' : 'public');

        const inputSummary = `Repository: ${fullName}`;
        const outputSummary = `Retrieved GitHub repository "${fullName}": ${description} (Stars: ${stars}, Forks: ${forks}, Open Issues: ${openIssues}, Branch: ${defaultBranch}, Visibility: ${visibility})`;

        return {
          toolId: request.toolId,
          toolName: 'GitHub Repository Research',
          status: 'success',
          timestamp,
          inputSummary,
          outputSummary,
          sourceReferences: [htmlUrl],
          sources: [
            {
              title: fullName,
              url: htmlUrl,
              excerpt: description,
              retrievalTimestamp: timestamp,
            },
          ],
          provenance: {
            ...request.provenance,
            isVerified: false,
            evidenceBasis: 'external_evidence',
            modelUsed: 'composio:github',
          },
          verificationState: 'source_retrieved',
          executionSafetyState: 'verified_safe',
          data: {
            name,
            fullName,
            description,
            htmlUrl,
            stars,
            forks,
            openIssues,
            defaultBranch,
            visibility,
          },
          limitations: [
            'External repository data retrieved from GitHub via Composio.',
            'Untrusted content quarantined; downstream architectural claims remain subject to verification.',
          ],
        };
      } else if (mapping.action === 'GITHUB_LIST_REPOSITORY_ISSUES') {
        const rawIssues = rawData?.issues || rawData?.response_data || (Array.isArray(rawData) ? rawData : []);
        const issues = (Array.isArray(rawIssues) ? rawIssues : []).slice(0, 10).map((issue: any) => ({
          number: issue.number,
          title: sanitizeUntrustedExternalText(issue.title),
          htmlUrl: issue.html_url,
          state: issue.state,
        }));

        const htmlUrl = `https://github.com/${request.input.owner}/${request.input.repo}/issues`;
        const outputSummary = `Retrieved ${issues.length} issue(s) for ${request.input.owner}/${request.input.repo}.`;

        return {
          toolId: request.toolId,
          toolName: 'GitHub Issues Read',
          status: 'success',
          timestamp,
          inputSummary: `Issues for ${request.input.owner}/${request.input.repo}`,
          outputSummary,
          sourceReferences: [htmlUrl],
          sources: [
            {
              title: `${request.input.owner}/${request.input.repo} Issues`,
              url: htmlUrl,
              excerpt: `${issues.length} issues listed`,
              retrievalTimestamp: timestamp,
            },
          ],
          provenance: {
            ...request.provenance,
            isVerified: false,
            evidenceBasis: 'external_evidence',
            modelUsed: 'composio:github',
          },
          verificationState: 'source_retrieved',
          executionSafetyState: 'verified_safe',
          data: { issues },
          limitations: [
            'External issue data retrieved from GitHub via Composio.',
            'Downstream claims remain subject to verification.',
          ],
        };
      }

      // Default fallback for any other allowlisted read action
      return {
        toolId: request.toolId,
        toolName: `${mapping.toolkit}:${mapping.action}`,
        status: 'success',
        timestamp,
        inputSummary: `Executed ${mapping.action}`,
        outputSummary: 'External read operation completed successfully.',
        provenance: request.provenance,
        verificationState: 'source_retrieved',
        executionSafetyState: 'verified_safe',
        limitations: ['External read data retrieved; downstream verification required.'],
      };
    } catch (error: any) {
      // Handle known errors (e.g. 404, rate limit, auth) without leaking keys or tokens
      const msg = error?.message || 'External execution failed';
      const cleanError = msg.includes('404')
        ? `Repository ${request.input?.owner}/${request.input?.repo} not found.`
        : msg.includes('rate limit')
        ? 'GitHub API rate limit encountered.'
        : 'GitHub API call failed via Composio.';

      return {
        toolId: request.toolId,
        toolName: `${mapping.toolkit}:${mapping.action}`,
        status: 'failed',
        timestamp,
        inputSummary: `Execution attempt: ${mapping.action}`,
        outputSummary: `Execution error: ${cleanError}`,
        provenance: request.provenance,
        verificationState: 'unverified',
        executionSafetyState: 'verified_safe',
        errorMessage: cleanError,
        limitations: ['External provider failed to complete request.'],
      };
    }
  }
}

export const composioProvider = new ComposioProvider();
