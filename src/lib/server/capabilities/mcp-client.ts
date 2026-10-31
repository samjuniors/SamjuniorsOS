/**
 * SamJuniorsOS — MCP Client Adapter (Gate G14.2)
 *
 * Spec Revision: 2026-07-28 (stateless core).
 * Sits strictly behind CapabilityGateway.
 *
 * Invariants:
 * 1. Self-contained calls: every call carries its own protocol version, requestId, and params.
 * 2. Works with both memory (fake) and stdio (real) transports.
 * 3. Enforces execution timeout and safe process cleanup.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  McpServerConfig,
  McpToolCallResult,
  McpToolsListResult,
  McpToolCallResultSchema,
  McpToolsListResultSchema,
  MCP_CURRENT_SPEC_REVISION,
} from '@/types/mcp';
import {
  IMcpTransport,
  McpMemoryTransport,
  McpStdioTransport,
  McpTransportError,
} from './mcp-transports';

export class McpClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpClientError';
  }
}

export class McpClientAdapter {
  private static instance: McpClientAdapter | null = null;
  private transports: Map<string, IMcpTransport> = new Map();

  private constructor() {}

  public static getInstance(): McpClientAdapter {
    if (!McpClientAdapter.instance) {
      McpClientAdapter.instance = new McpClientAdapter();
    }
    return McpClientAdapter.instance;
  }

  /**
   * Resets and closes all active transports (for clean test isolation).
   */
  public async reset(): Promise<void> {
    for (const [, transport] of this.transports) {
      await transport.close();
    }
    this.transports.clear();
  }

  /**
   * Registers a transport instance directly (useful for mounting McpMemoryTransport fake server).
   */
  public registerTransport(serverId: string, transport: IMcpTransport): void {
    const existing = this.transports.get(serverId);
    if (existing) {
      existing.close();
    }
    this.transports.set(serverId, transport);
  }

  /**
   * Gets or initializes transport for an MCP server config.
   */
  public getOrCreateTransport(config: McpServerConfig): IMcpTransport {
    const existing = this.transports.get(config.id);
    if (existing && existing.isAlive()) {
      return existing;
    }

    let transport: IMcpTransport;
    if (config.transport === 'memory') {
      transport = new McpMemoryTransport();
    } else if (config.transport === 'stdio') {
      if (!config.command) {
        throw new McpClientError(`MCP stdio server "${config.id}" requires a command.`);
      }
      transport = new McpStdioTransport(config.command, config.args || [], {
        env: config.env,
      });
    } else {
      throw new McpClientError(`Unsupported transport type "${config.transport}"`);
    }

    this.transports.set(config.id, transport);
    return transport;
  }

  /**
   * Lists tools available on the specified MCP server.
   */
  public async listTools(config: McpServerConfig): Promise<McpToolsListResult> {
    const transport = this.getOrCreateTransport(config);
    const requestId = uuidv4();

    const response = await transport.send(
      {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list',
        params: {
          _meta: {
            protocolVersion: MCP_CURRENT_SPEC_REVISION,
            requestId,
          },
        },
      },
      config.timeoutMs || 10000
    );

    if (response.error) {
      throw new McpClientError(
        `MCP tools/list failed (${response.error.code}): ${response.error.message}`
      );
    }

    const parseResult = McpToolsListResultSchema.safeParse(response.result);
    if (!parseResult.success) {
      throw new McpClientError(
        `Invalid tools/list response: ${parseResult.error.message}`
      );
    }

    return parseResult.data;
  }

  /**
   * Calls a tool on the specified MCP server in a self-contained execution.
   */
  public async callTool(
    config: McpServerConfig,
    toolName: string,
    args: Record<string, any> = {},
    callerContext?: {
      callerAgentId?: string;
      userId?: string;
      conversationId?: string;
    }
  ): Promise<McpToolCallResult> {
    const transport = this.getOrCreateTransport(config);
    const requestId = uuidv4();

    const response = await transport.send(
      {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
          _meta: {
            protocolVersion: MCP_CURRENT_SPEC_REVISION,
            requestId,
            callerAgentId: callerContext?.callerAgentId,
            conversationId: callerContext?.conversationId,
          },
        },
      },
      config.timeoutMs || 10000
    );

    if (response.error) {
      throw new McpClientError(
        `MCP tool "${toolName}" call failed (${response.error.code}): ${response.error.message}`
      );
    }

    const parseResult = McpToolCallResultSchema.safeParse(response.result);
    if (!parseResult.success) {
      throw new McpClientError(
        `Invalid tools/call result format: ${parseResult.error.message}`
      );
    }

    return parseResult.data;
  }
}
