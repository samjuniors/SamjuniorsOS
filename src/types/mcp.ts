/**
 * SamJuniorsOS — Model Context Protocol (MCP) Types (Gate G14.2)
 *
 * Current Spec Revision: 2026-07-28
 * Architecture: Modern stateless request/response core.
 * Every request is self-contained with per-request metadata (_meta.protocolVersion).
 * Eliminates legacy (2024-11-05) stateful initialization handshake.
 */

import { z } from 'zod';

export const MCP_CURRENT_SPEC_REVISION = '2026-07-28' as const;
export const MCP_LEGACY_SPEC_REVISION = '2024-11-05' as const;

export type McpProtocolRevision =
  | typeof MCP_CURRENT_SPEC_REVISION
  | typeof MCP_LEGACY_SPEC_REVISION;

export const McpTransportTypeSchema = z.enum([
  'stdio',
  'sse',
  'memory',
]);

export type McpTransportType = z.infer<typeof McpTransportTypeSchema>;

export const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: McpTransportTypeSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(10000),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.any()).optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.any().optional(),
});

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.any().optional(),
  error: JsonRpcErrorSchema.optional(),
});

export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const McpContentItemSchema = z.object({
  type: z.enum(['text', 'image', 'resource']),
  text: z.string().optional(),
  data: z.string().optional(),
  mimeType: z.string().optional(),
  uri: z.string().optional(),
});

export type McpContentItem = z.infer<typeof McpContentItemSchema>;

export const McpToolCallResultSchema = z.object({
  content: z.array(McpContentItemSchema),
  isError: z.boolean().default(false),
  _meta: z.record(z.string(), z.any()).optional(),
});

export type McpToolCallResult = z.infer<typeof McpToolCallResultSchema>;

export const McpToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.any()).optional(),
});

export type McpToolDefinition = z.infer<typeof McpToolDefinitionSchema>;

export const McpToolsListResultSchema = z.object({
  tools: z.array(McpToolDefinitionSchema),
  nextCursor: z.string().optional(),
  _meta: z.record(z.string(), z.any()).optional(),
});

export type McpToolsListResult = z.infer<typeof McpToolsListResultSchema>;
