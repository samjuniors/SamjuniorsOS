import { z } from "zod";
import type { RouteSideEffectClass } from "./decision";

/**
 * Route Side Effect Class Schema
 */
export const RouteSideEffectClassSchema = z.enum([
  "read_only",
  "internal_write",
  "external_reversible",
  "external_hard_to_reverse",
  "financial_legal",
  "destructive_security",
]);

export type { RouteSideEffectClass };

/**
 * Capability Trust Tiers (Gate G14.1)
 *
 * Implements strict hierarchical trust model:
 * core > verified_partner > community > untrusted
 */
export const CapabilityTrustTierSchema = z.enum([
  "core",
  "verified_partner",
  "community",
  "untrusted",
]);

export type CapabilityTrustTier = z.infer<typeof CapabilityTrustTierSchema>;

/**
 * Capability Kinds
 */
export const CapabilityKindSchema = z.enum([
  "tool",
  "skill",
  "mcp_server",
]);

export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;

/**
 * Capability Granular Permissions
 * Format: category:action[:target] (e.g. "fs:read", "net:outbound:api.github.com")
 */
export const CapabilityPermissionSchema = z
  .string()
  .min(3)
  .regex(
    /^[a-z0-9_-]+:[a-z0-9_*.:-]+$/i,
    "Permission must follow category:action format (e.g. fs:read, net:outbound:api.github.com)"
  );

export type CapabilityPermission = z.infer<typeof CapabilityPermissionSchema>;

/**
 * Capability Cost Model (Financial & Token Usage)
 */
export const CapabilityCostModelSchema = z.object({
  perCallCents: z.number().nonnegative().default(0),
  tokenCostPer1k: z.number().nonnegative().optional(),
  currency: z.string().default("USD"),
});

export type CapabilityCostModel = z.infer<typeof CapabilityCostModelSchema>;

/**
 * Execution Entrypoint Definition
 */
export const CapabilityEntrypointSchema = z.object({
  type: z.enum([
    "internal_function",
    "mcp_stdio",
    "mcp_sse",
    "prompt_template",
  ]),
  target: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type CapabilityEntrypoint = z.infer<typeof CapabilityEntrypointSchema>;

/**
 * Authoritative Capability Manifest Schema (Gate G14.1)
 *
 * Exit evidence required:
 * Every tool, skill, and MCP server must have a validated manifest with:
 * 1. permissions
 * 2. side-effect class
 * 3. trust tier
 * 4. version pin (strictly pinned semantic version)
 * 5. cost model
 */
export const CapabilityManifestSchema = z.object({
  id: z
    .string()
    .min(3)
    .regex(
      /^[a-z0-9_.-]+:[a-z0-9_.-]+(:[a-z0-9_.-]+)?$/i,
      "Capability id must follow namespace:name format (e.g. tool:github:read_issue)"
    ),
  name: z.string().min(1),
  description: z.string().min(1),
  kind: CapabilityKindSchema,
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must be strictly pinned semantic version (e.g. 1.0.0, no wildcards or floating tags)"
    ),
  trustTier: CapabilityTrustTierSchema,
  sideEffectClass: RouteSideEffectClassSchema,
  permissions: z.array(CapabilityPermissionSchema).default([]),
  cost: CapabilityCostModelSchema.default({ perCallCents: 0, currency: "USD" }),
  entrypoint: CapabilityEntrypointSchema,
  inputSchema: z.record(z.string(), z.any()).optional(),
  outputSchema: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

/**
 * Invocation Request dispatched exclusively through CapabilityGateway
 */
export const CapabilityInvocationRequestSchema = z.object({
  capabilityId: z.string().min(1),
  callerAgentId: z.string().min(1),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  parameters: z.record(z.string(), z.any()).default({}),
  reason: z.string().optional(),
});

export type CapabilityInvocationRequest = z.infer<typeof CapabilityInvocationRequestSchema>;

/**
 * Invocation Result emitted by CapabilityGateway
 */
export const CapabilityInvocationResultSchema = z.object({
  success: z.boolean(),
  capabilityId: z.string(),
  status: z.enum([
    "executed",
    "awaiting_founder_approval",
    "denied",
    "error",
  ]),
  data: z.any().optional(),
  error: z.string().optional(),
  approvalId: z.string().optional(),
  payloadHash: z.string().optional(),
  durationMs: z.number().nonnegative(),
  costChargedCents: z.number().nonnegative().default(0),
});

export type CapabilityInvocationResult = z.infer<typeof CapabilityInvocationResultSchema>;
