import { ToolDefinition } from '@/types/capabilities';

/**
 * GitHub Repository Read Tool Definition (Read-Only)
 * Fulfills software_repository_research and requirements_analysis skills.
 */
export const GITHUB_REPOSITORY_READ_TOOL: ToolDefinition = {
  id: 'github_repository_read',
  name: 'GitHub Repository Research',
  description: 'Reads repository metadata, specifications, and architecture details from GitHub via Composio.',
  category: 'Engineering',
  capabilities: ['software_repository_research', 'repository_research', 'requirements_analysis'],
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'GitHub repository owner or organization (e.g. "octocat")',
      },
      repo: {
        type: 'string',
        description: 'GitHub repository name (e.g. "Hello-World")',
      },
    },
    required: ['owner', 'repo'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      full_name: { type: 'string' },
      description: { type: 'string' },
      html_url: { type: 'string' },
      stargazers_count: { type: 'number' },
      default_branch: { type: 'string' },
      open_issues_count: { type: 'number' },
      forks_count: { type: 'number' },
    },
  },
  riskLevel: 'low',
  requiresApproval: false,
  mutationClass: 'read',
  availability: 'available',
  provider: 'composio',
};

/**
 * GitHub Issues Read Tool Definition (Read-Only)
 * Fulfills software_repository_research and requirements_analysis skills.
 */
export const GITHUB_ISSUES_READ_TOOL: ToolDefinition = {
  id: 'github_issues_read',
  name: 'GitHub Issues Read',
  description: 'Reads issue tickets and discussions from a GitHub repository via Composio.',
  category: 'Engineering',
  capabilities: ['software_repository_research', 'repository_research', 'requirements_analysis'],
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'GitHub repository owner or organization',
      },
      repo: {
        type: 'string',
        description: 'GitHub repository name',
      },
    },
    required: ['owner', 'repo'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            title: { type: 'string' },
            body: { type: 'string' },
            html_url: { type: 'string' },
            state: { type: 'string' },
          },
        },
      },
    },
  },
  riskLevel: 'low',
  requiresApproval: false,
  mutationClass: 'read',
  availability: 'available',
  provider: 'composio',
};

/**
 * Alias definition for legacy github_read
 */
export const GITHUB_READ_TOOL: ToolDefinition = {
  ...GITHUB_REPOSITORY_READ_TOOL,
  id: 'github_read',
  name: 'GitHub Read',
};
