#!/usr/bin/env node
/**
 * SamJuniorsOS — Reference MCP Stdio Server (Gate G14.2)
 *
 * Implements Model Context Protocol specification revision 2026-07-28 (stateless core).
 * Responds to JSON-RPC 2.0 line-delimited messages over stdin/stdout.
 */

import readline from 'node:readline';

const TOOLS = [
  {
    name: 'sqlite_query',
    description: 'Executes a read-only query on the replica database.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'system_echo',
    description: 'Echoes back the received message with server timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    sendResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` },
    });
    return;
  }

  const { id, method, params } = request;

  switch (method) {
    case 'tools/list': {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS,
          _meta: {
            protocolVersion: '2026-07-28',
            server: 'mcp-sample-server',
          },
        },
      });
      break;
    }

    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === 'sqlite_query') {
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  rows: [
                    { id: 1, key: 'company_name', value: 'SamJuniors' },
                    { id: 2, key: 'status', value: 'operating' },
                  ],
                  rowCount: 2,
                  query: args.query,
                }),
              },
            ],
            isError: false,
            _meta: { protocolVersion: '2026-07-28' },
          },
        });
      } else if (toolName === 'system_echo') {
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `ECHO [${new Date().toISOString()}]: ${args.message || ''}`,
              },
            ],
            isError: false,
            _meta: { protocolVersion: '2026-07-28' },
          },
        });
      } else {
        sendResponse({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        });
      }
      break;
    }

    case 'ping': {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: { pong: true, _meta: { protocolVersion: '2026-07-28' } },
      });
      break;
    }

    default: {
      sendResponse({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method "${method}" not recognized by MCP 2026-07-28 server`,
        },
      });
    }
  }
});
