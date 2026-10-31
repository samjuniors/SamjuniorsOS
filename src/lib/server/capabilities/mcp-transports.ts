/**
 * SamJuniorsOS — MCP Transports (Gate G14.2)
 *
 * Implements Model Context Protocol 2026-07-28 transports:
 * 1. McpMemoryTransport (Fake in-memory server for deterministic zero-IO testing)
 * 2. McpStdioTransport (Real child-process server communicating over stdin/stdout)
 */

import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  MCP_CURRENT_SPEC_REVISION,
} from '@/types/mcp';

export class McpTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpTransportError';
  }
}

export class McpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpTimeoutError';
  }
}

export interface IMcpTransport {
  send(request: JsonRpcRequest, timeoutMs?: number): Promise<JsonRpcResponse>;
  close(): Promise<void>;
  isAlive(): boolean;
}

/**
 * 1. Fake In-Memory MCP Transport
 * Simulates a full MCP 2026-07-28 server without OS processes.
 */
export class McpMemoryTransport implements IMcpTransport {
  private alive = true;
  private tools: Map<
    string,
    { definition: McpToolDefinition; handler: (args: any) => Promise<any> }
  > = new Map();

  constructor() {
    this.registerDefaults();
  }

  public isAlive(): boolean {
    return this.alive;
  }

  public registerTool(
    name: string,
    description: string,
    inputSchema: Record<string, any> | undefined,
    handler: (args: any) => Promise<any>
  ): void {
    this.tools.set(name, {
      definition: { name, description, inputSchema },
      handler,
    });
  }

  public async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.alive) {
      throw new McpTransportError('McpMemoryTransport is closed.');
    }

    const { id, method, params } = request;

    if (method === 'tools/list') {
      const toolList = Array.from(this.tools.values()).map((t) => t.definition);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: toolList,
          _meta: { protocolVersion: MCP_CURRENT_SPEC_REVISION },
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Tool "${toolName}" not found on memory MCP server.`,
          },
        };
      }

      try {
        const output = await tool.handler(params?.arguments || {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof output === 'string' ? output : JSON.stringify(output),
              },
            ],
            isError: false,
            _meta: { protocolVersion: MCP_CURRENT_SPEC_REVISION },
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: err?.message || 'Tool execution error' }],
            isError: true,
            _meta: { protocolVersion: MCP_CURRENT_SPEC_REVISION },
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method "${method}" not implemented on memory server.`,
      },
    };
  }

  public async close(): Promise<void> {
    this.alive = false;
    this.tools.clear();
  }

  private registerDefaults(): void {
    this.registerTool(
      'fake_echo',
      'Echoes input text for verification.',
      { type: 'object', properties: { message: { type: 'string' } } },
      async (args) => `Fake Echo: ${args.message}`
    );

    this.registerTool(
      'fake_add',
      'Adds two numbers.',
      { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
      async (args) => Number(args.a) + Number(args.b)
    );

    this.registerTool(
      'fake_fail',
      'Fails with simulated error.',
      undefined,
      async () => {
        throw new Error('Simulated fake tool error');
      }
    );
  }
}

/**
 * 2. Real Stdio MCP Transport
 * Spawns a real child process and communicates via line-delimited JSON-RPC 2.0.
 */
export class McpStdioTransport implements IMcpTransport {
  private child: ChildProcess | null = null;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (res: JsonRpcResponse) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  > = new Map();
  private rl: readline.Interface | null = null;
  private alive = false;

  constructor(
    private command: string,
    private args: string[] = [],
    private options: {
      cwd?: string;
      env?: Record<string, string>;
    } = {}
  ) {
    this.startProcess();
  }

  public isAlive(): boolean {
    return this.alive && this.child !== null && !this.child.killed;
  }

  private startProcess(): void {
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd || process.cwd(),
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.alive = true;

    this.child.on('error', (err) => {
      this.cleanupPending(new McpTransportError(`Child process error: ${err.message}`));
      this.alive = false;
    });

    this.child.on('exit', (code) => {
      this.alive = false;
      this.cleanupPending(
        new McpTransportError(`Child process exited with code ${code}`)
      );
    });

    if (this.child.stdout) {
      this.rl = readline.createInterface({
        input: this.child.stdout,
        terminal: false,
      });

      this.rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const response = JSON.parse(trimmed) as JsonRpcResponse;
          if (response.id !== undefined && response.id !== null) {
            const pending = this.pendingRequests.get(response.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingRequests.delete(response.id);
              pending.resolve(response);
            }
          }
        } catch {
          // ignore non-json lines
        }
      });
    }
  }

  public async send(
    request: JsonRpcRequest,
    timeoutMs: number = 10000
  ): Promise<JsonRpcResponse> {
    if (!this.isAlive() || !this.child || !this.child.stdin) {
      throw new McpTransportError('MCP stdio process is not running or stdin is closed.');
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(
          new McpTimeoutError(
            `MCP request ${request.id} timed out after ${timeoutMs} ms.`
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timer });

      try {
        const payload = JSON.stringify(request) + '\n';
        this.child!.stdin!.write(payload);
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(request.id);
        reject(new McpTransportError(`Failed to write to stdin: ${err.message}`));
      }
    });
  }

  public async close(): Promise<void> {
    this.alive = false;
    this.cleanupPending(new McpTransportError('MCP Stdio transport closed.'));

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        // process may have already exited
      }
      this.child = null;
    }
  }

  private cleanupPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
