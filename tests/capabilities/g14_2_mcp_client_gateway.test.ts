/**
 * SamJuniorsOS — Gate G14.2 Test Suite
 *
 * Verifies:
 * 1. MCP specification revision confirmation (2026-07-28 stateless core).
 * 2. MCP client works with one fake server (McpMemoryTransport) and one real server (McpStdioTransport).
 * 3. Calls are self-contained with per-call metadata and timeout protection.
 * 4. Full integration behind CapabilityGateway with an immutable audit record per call.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import {
  MCP_CURRENT_SPEC_REVISION,
  MCP_LEGACY_SPEC_REVISION,
  McpServerConfig,
} from '@/types/mcp';
import {
  McpMemoryTransport,
  McpStdioTransport,
} from '@/lib/server/capabilities/mcp-transports';
import { McpClientAdapter } from '@/lib/server/capabilities/mcp-client';
import { CapabilityRegistry } from '@/lib/server/capabilities/capability-registry';
import { CapabilityGateway } from '@/lib/server/capabilities/capability-gateway';
import { InMemoryAuditStore } from '@/lib/server/authorization/approval-store';

describe('Gate G14.2 — MCP Client behind CapabilityGateway (Spec 2026-07-28)', () => {
  let mcpClient: McpClientAdapter;
  let registry: CapabilityRegistry;
  let auditStore: InMemoryAuditStore;

  const sampleServerScript = path.resolve(__dirname, '../../scripts/mcp-sample-server.mjs');

  beforeEach(() => {
    mcpClient = McpClientAdapter.getInstance();
    registry = CapabilityRegistry.getInstance();
    auditStore = InMemoryAuditStore.getInstance();
    registry.reset();
  });

  afterEach(async () => {
    await mcpClient.reset();
  });

  describe('1. Spec Revision Confirmation', () => {
    it('confirms 2026-07-28 as current authoritative stateless spec revision', () => {
      expect(MCP_CURRENT_SPEC_REVISION).toBe('2026-07-28');
      expect(MCP_LEGACY_SPEC_REVISION).toBe('2024-11-05');
    });

    it('executes tools/call without requiring legacy stateful initialization handshake', async () => {
      // Modern 2026-07-28 spec does not require an "initialize" handshake
      const memoryTransport = new McpMemoryTransport();
      const response = await memoryTransport.send({
        jsonrpc: '2.0',
        id: 'direct-call-1',
        method: 'tools/call',
        params: {
          name: 'fake_echo',
          arguments: { message: 'stateless invocation' },
          _meta: { protocolVersion: MCP_CURRENT_SPEC_REVISION },
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('Fake Echo: stateless invocation');
      expect(response.result._meta?.protocolVersion).toBe('2026-07-28');
    });
  });

  describe('2. Fake Server Verification (McpMemoryTransport)', () => {
    const fakeConfig: McpServerConfig = {
      id: 'fake-server',
      name: 'Fake In-Memory Server',
      transport: 'memory',
      timeoutMs: 5000,
    };

    it('lists available tools from the fake server', async () => {
      const list = await mcpClient.listTools(fakeConfig);
      expect(list.tools).toBeDefined();
      expect(list.tools.length).toBeGreaterThanOrEqual(3);

      const toolNames = list.tools.map((t) => t.name);
      expect(toolNames).toContain('fake_echo');
      expect(toolNames).toContain('fake_add');
      expect(toolNames).toContain('fake_fail');
    });

    it('calls fake_echo and fake_add successfully', async () => {
      const echoResult = await mcpClient.callTool(fakeConfig, 'fake_echo', {
        message: 'hello from test',
      });
      expect(echoResult.isError).toBe(false);
      expect(echoResult.content[0].text).toBe('Fake Echo: hello from test');

      const addResult = await mcpClient.callTool(fakeConfig, 'fake_add', {
        a: 25,
        b: 17,
      });
      expect(addResult.isError).toBe(false);
      expect(addResult.content[0].text).toBe('42');
    });

    it('captures fake tool error responses cleanly', async () => {
      const failResult = await mcpClient.callTool(fakeConfig, 'fake_fail');
      expect(failResult.isError).toBe(true);
      expect(failResult.content[0].text).toContain('Simulated fake tool error');
    });

    it('throws when invoking an unknown tool on the fake server', async () => {
      expect(async () => {
        await mcpClient.callTool(fakeConfig, 'non_existent_tool');
      }).toThrow(/not found on memory MCP server/);
    });
  });

  describe('3. Real Server Verification (McpStdioTransport)', () => {
    const realConfig: McpServerConfig = {
      id: 'real-stdio-server',
      name: 'Real Stdio Server',
      transport: 'stdio',
      command: 'node',
      args: [sampleServerScript],
      timeoutMs: 5000,
    };

    it('lists tools from a real Node.js stdio child process', async () => {
      const list = await mcpClient.listTools(realConfig);
      expect(list.tools).toBeDefined();
      expect(list.tools.length).toBe(2);

      const toolNames = list.tools.map((t) => t.name);
      expect(toolNames).toContain('sqlite_query');
      expect(toolNames).toContain('system_echo');
    });

    it('executes sqlite_query on real stdio server and receives JSON output', async () => {
      const result = await mcpClient.callTool(realConfig, 'sqlite_query', {
        query: 'SELECT * FROM company;',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text || '{}');
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows[0].value).toBe('SamJuniors');
      expect(parsed.query).toBe('SELECT * FROM company;');
    });

    it('executes system_echo on real stdio server and receives timestamped echo', async () => {
      const result = await mcpClient.callTool(realConfig, 'system_echo', {
        message: 'real stdio live test',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('ECHO');
      expect(result.content[0].text).toContain('real stdio live test');
    });

    it('cleans up stdio child process gracefully', async () => {
      const transport = mcpClient.getOrCreateTransport(realConfig);
      expect(transport.isAlive()).toBe(true);

      await mcpClient.reset();
      expect(transport.isAlive()).toBe(false);
    });
  });

  describe('4. Full Integration Behind CapabilityGateway & Audit Record', () => {
    it('executes an MCP tool through CapabilityGateway and persists an immutable audit record', async () => {
      // Register a real MCP tool capability
      registry.register({
        id: 'mcp:sqlite:company_query',
        name: 'SQLite Company Query',
        description: 'Queries SQLite replica via MCP stdio protocol',
        kind: 'mcp_server',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'read_only',
        permissions: ['db:read'],
        cost: { perCallCents: 0, currency: 'USD' },
        entrypoint: {
          type: 'mcp_stdio',
          target: 'node',
          args: [sampleServerScript],
        },
        metadata: {
          mcpToolName: 'sqlite_query',
        },
      });

      const initialAuditCount = auditStore.audits.size;

      const result = await CapabilityGateway.invoke({
        capabilityId: 'mcp:sqlite:company_query',
        callerAgentId: 'researcher',
        conversationId: 'conv-mcp-test-1',
        parameters: { query: 'SELECT * FROM users;' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('executed');
      expect(result.data).toBeDefined();

      const parsed = JSON.parse(result.data.content[0].text);
      expect(parsed.rowCount).toBe(2);

      // Verify that an immutable audit record was recorded
      expect(auditStore.audits.size).toBeGreaterThan(initialAuditCount);

      const latestAudit = Array.from(auditStore.audits.values()).pop();
      expect(latestAudit).toBeDefined();
      expect(latestAudit?.skillId).toBe('mcp:sqlite:company_query');
      expect(latestAudit?.actionName).toBe('mcp:sqlite:company_query');
      expect(latestAudit?.decision).toBe('allowed');
      expect(latestAudit?.reasonCode).toBe('READ_ONLY_ALLOWED');
      expect(latestAudit?.executed).toBe(true);
      expect(latestAudit?.recordHash).toBeDefined();
    });

    it('routes consequential MCP tool mutations to founder approval gate', async () => {
      // Register an MCP tool requiring financial/legal authorization
      registry.register({
        id: 'mcp:finance:transfer_funds',
        name: 'MCP Finance Transfer',
        description: 'Transfers treasury funds via MCP tool call',
        kind: 'mcp_server',
        version: '1.0.0',
        trustTier: 'core',
        sideEffectClass: 'financial_legal',
        permissions: ['net:outbound:banking.api'],
        cost: { perCallCents: 50, currency: 'USD' },
        entrypoint: {
          type: 'mcp_stdio',
          target: 'node',
          args: [sampleServerScript],
        },
        metadata: {
          mcpToolName: 'transfer_funds',
        },
      });

      const result = await CapabilityGateway.invoke({
        capabilityId: 'mcp:finance:transfer_funds',
        callerAgentId: 'finance',
        parameters: { amountUsd: 10000, recipient: 'vendor-corp' },
        reason: 'Payment for cloud infrastructure bill',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('awaiting_founder_approval');
      expect(result.approvalId).toBeDefined();
      expect(result.payloadHash).toBeDefined();
    });
  });
});
