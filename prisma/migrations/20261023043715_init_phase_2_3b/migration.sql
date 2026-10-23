-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'FOUNDER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'SamJuniors Ecosystem',
    "stage" TEXT NOT NULL DEFAULT 'Seed',
    "products" JSONB NOT NULL DEFAULT '[]',
    "initiatives" JSONB NOT NULL DEFAULT '[]',
    "customers" JSONB NOT NULL DEFAULT '[]',
    "employees" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "attentionItems" JSONB NOT NULL DEFAULT '[]',
    "financialModel" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_knowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "category" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "importance" INTEGER NOT NULL DEFAULT 1,
    "decayScore" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "objective" TEXT NOT NULL,
    "stepStates" JSONB NOT NULL DEFAULT '{}',
    "context" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "initiatedById" TEXT,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workflow_instances_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scheduled_work_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowInstanceId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "executeAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "scheduler_heartbeats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerSource" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "asOfTime" DATETIME NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "executedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "awaitingApprovalCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "approval_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowInstanceId" TEXT,
    "stepId" TEXT NOT NULL,
    "campaignId" TEXT,
    "employeeRole" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "payloadHash" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "reason" TEXT,
    "expiresAt" DATETIME,
    "consumedAt" DATETIME,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "founderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "approval_records_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "approval_records_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "side_effect_audits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT,
    "approvalId" TEXT,
    "workflowInstanceId" TEXT,
    "stepId" TEXT,
    "employeeRole" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "decisionOutcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "executionReference" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "side_effect_audits_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "telemetry_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "metadata" JSONB,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "protocolStep" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "directive" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "outputContent" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL DEFAULT '{}',
    "claimsGenerated" JSONB NOT NULL DEFAULT '[]',
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "modelUsed" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "epistemic_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystem" TEXT NOT NULL,
    "uri" TEXT,
    "title" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "provenanceKind" TEXT NOT NULL DEFAULT 'live_operational',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "epistemic_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "extractedObservation" TEXT NOT NULL,
    "data" JSONB,
    "confidence" TEXT NOT NULL DEFAULT 'high_confidence',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "epistemic_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "epistemic_claims" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT,
    "signalId" TEXT,
    "agentRunId" TEXT,
    "statement" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'unverified',
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "evidenceReferences" JSONB NOT NULL DEFAULT '[]',
    "verificationNotes" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "epistemic_claims_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "epistemic_claims_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "epistemic_signals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "epistemic_claims_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "epistemic_verifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "policyOutcome" TEXT NOT NULL,
    "conflictingFactIds" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT NOT NULL,
    "precedenceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "epistemic_verifications_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "epistemic_claims" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "canonical_facts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "sourceId" TEXT,
    "statement" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "validityState" TEXT NOT NULL DEFAULT 'active',
    "supersededById" TEXT,
    "supersededAt" DATETIME,
    "confidence" TEXT NOT NULL DEFAULT 'verified_fact',
    "promotedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedBy" TEXT NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "canonical_facts_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "epistemic_claims" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canonical_facts_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "canonical_facts_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "canonical_facts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dependency_relations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceEntity" TEXT NOT NULL,
    "sourceEntityDisplay" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetEntityDisplay" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'DEPENDS_ON',
    "scope" TEXT NOT NULL DEFAULT 'company',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceFactId" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "payloadHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "executionRef" TEXT,
    "response" JSONB,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "distributed_leases" (
    "resourceKey" TEXT NOT NULL PRIMARY KEY,
    "holderId" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "founderId" TEXT NOT NULL,
    "title" TEXT,
    "agentId" TEXT NOT NULL DEFAULT 'sophia',
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "confidence" REAL,
    "commandType" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sophia_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "founderId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lifecycleState" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_decisions" (
    "decisionId" TEXT NOT NULL PRIMARY KEY,
    "creationRequestId" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "proposedAction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "proposer" TEXT NOT NULL,
    "accountableOwner" TEXT NOT NULL,
    "evidenceFactIds" JSONB NOT NULL DEFAULT '[]',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "uncertainty" JSONB NOT NULL DEFAULT '{}',
    "impact" TEXT NOT NULL,
    "reversibility" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "decisionReason" TEXT,
    "approvedPayloadHash" TEXT,
    "approvalId" TEXT,
    "linkedWorkflowId" TEXT,
    "outcome" JSONB,
    "supersedesDecisionId" TEXT,
    "supersededByDecisionId" TEXT,
    "cancellationState" JSONB,
    "transitions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "council_deliberations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliberationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "leaseStatus" TEXT NOT NULL DEFAULT 'in_progress',
    "claimedByPid" INTEGER,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "directive" TEXT,
    "status" TEXT,
    "verdict" TEXT,
    "result" JSONB,
    "orphanedProviderCalls" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "reconciledAt" DATETIME,
    "reconciliationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "communication_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT,
    "organizationName" TEXT,
    "role" TEXT,
    "title" TEXT,
    "verificationState" TEXT NOT NULL DEFAULT 'unverified',
    "sourceProvenance" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "communication_organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "communication_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "threadId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "sender" JSONB NOT NULL DEFAULT '{}',
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "cc" JSONB NOT NULL DEFAULT '[]',
    "bcc" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL,
    "bodyContent" TEXT NOT NULL,
    "bodyMimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'draft',
    "sourceProvenance" JSONB,
    "externalProviderRef" TEXT,
    "executionRef" TEXT,
    "evidenceRef" TEXT,
    "error" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "communication_webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_state_organizationId_key" ON "company_state"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "company_knowledge_hash_key" ON "company_knowledge"("hash");

-- CreateIndex
CREATE INDEX "company_knowledge_category_idx" ON "company_knowledge"("category");

-- CreateIndex
CREATE INDEX "company_memories_type_createdAt_idx" ON "company_memories"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_id_version_key" ON "workflow_definitions"("id", "version");

-- CreateIndex
CREATE INDEX "workflow_instances_status_idx" ON "workflow_instances"("status");

-- CreateIndex
CREATE INDEX "workflow_instances_status_stateVersion_idx" ON "workflow_instances"("status", "stateVersion");

-- CreateIndex
CREATE INDEX "scheduled_work_items_status_executeAt_idx" ON "scheduled_work_items"("status", "executeAt");

-- CreateIndex
CREATE INDEX "scheduled_work_items_workflowInstanceId_stepId_idx" ON "scheduled_work_items"("workflowInstanceId", "stepId");

-- CreateIndex
CREATE INDEX "scheduled_work_items_idempotencyKey_idx" ON "scheduled_work_items"("idempotencyKey");

-- CreateIndex
CREATE INDEX "scheduler_heartbeats_evaluatedAt_idx" ON "scheduler_heartbeats"("evaluatedAt");

-- CreateIndex
CREATE INDEX "approval_records_decision_idx" ON "approval_records"("decision");

-- CreateIndex
CREATE INDEX "approval_records_workflowInstanceId_stepId_idx" ON "approval_records"("workflowInstanceId", "stepId");

-- CreateIndex
CREATE INDEX "approval_records_payloadHash_idx" ON "approval_records"("payloadHash");

-- CreateIndex
CREATE INDEX "side_effect_audits_requestId_idx" ON "side_effect_audits"("requestId");

-- CreateIndex
CREATE INDEX "side_effect_audits_workflowInstanceId_stepId_idx" ON "side_effect_audits"("workflowInstanceId", "stepId");

-- CreateIndex
CREATE INDEX "side_effect_audits_targetSystem_timestamp_idx" ON "side_effect_audits"("targetSystem", "timestamp");

-- CreateIndex
CREATE INDEX "telemetry_metrics_source_metricKey_recordedAt_idx" ON "telemetry_metrics"("source", "metricKey", "recordedAt");

-- CreateIndex
CREATE INDEX "agent_runs_agentId_status_createdAt_idx" ON "agent_runs"("agentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "epistemic_sources_sourceSystem_capturedAt_idx" ON "epistemic_sources"("sourceSystem", "capturedAt");

-- CreateIndex
CREATE INDEX "epistemic_sources_contentHash_idx" ON "epistemic_sources"("contentHash");

-- CreateIndex
CREATE INDEX "epistemic_signals_sourceId_idx" ON "epistemic_signals"("sourceId");

-- CreateIndex
CREATE INDEX "epistemic_signals_signalType_timestamp_idx" ON "epistemic_signals"("signalType", "timestamp");

-- CreateIndex
CREATE INDEX "epistemic_claims_verificationStatus_category_idx" ON "epistemic_claims"("verificationStatus", "category");

-- CreateIndex
CREATE INDEX "epistemic_claims_subject_idx" ON "epistemic_claims"("subject");

-- CreateIndex
CREATE INDEX "epistemic_claims_proposedBy_idx" ON "epistemic_claims"("proposedBy");

-- CreateIndex
CREATE UNIQUE INDEX "epistemic_verifications_claimId_key" ON "epistemic_verifications"("claimId");

-- CreateIndex
CREATE INDEX "epistemic_verifications_passed_policyOutcome_idx" ON "epistemic_verifications"("passed", "policyOutcome");

-- CreateIndex
CREATE INDEX "canonical_facts_validityState_category_idx" ON "canonical_facts"("validityState", "category");

-- CreateIndex
CREATE INDEX "canonical_facts_subject_idx" ON "canonical_facts"("subject");

-- CreateIndex
CREATE INDEX "canonical_facts_supersededById_idx" ON "canonical_facts"("supersededById");

-- CreateIndex
CREATE INDEX "dependency_relations_targetEntity_relationType_status_idx" ON "dependency_relations"("targetEntity", "relationType", "status");

-- CreateIndex
CREATE INDEX "dependency_relations_sourceEntity_relationType_status_idx" ON "dependency_relations"("sourceEntity", "relationType", "status");

-- CreateIndex
CREATE INDEX "dependency_relations_sourceFactId_idx" ON "dependency_relations"("sourceFactId");

-- CreateIndex
CREATE UNIQUE INDEX "dependency_relations_sourceEntity_targetEntity_relationType_sourceFactId_key" ON "dependency_relations"("sourceEntity", "targetEntity", "relationType", "sourceFactId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_status_createdAt_idx" ON "idempotency_records"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_payloadHash_idx" ON "idempotency_records"("payloadHash");

-- CreateIndex
CREATE INDEX "distributed_leases_expiresAt_idx" ON "distributed_leases"("expiresAt");

-- CreateIndex
CREATE INDEX "conversations_founderId_updatedAt_idx" ON "conversations"("founderId", "updatedAt");

-- CreateIndex
CREATE INDEX "conversations_founderId_status_idx" ON "conversations"("founderId", "status");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_idempotencyKey_idx" ON "chat_messages"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "sophia_memories_founderId_active_updatedAt_idx" ON "sophia_memories"("founderId", "active", "updatedAt");

-- CreateIndex
CREATE INDEX "sophia_memories_founderId_lifecycleState_updatedAt_idx" ON "sophia_memories"("founderId", "lifecycleState", "updatedAt");

-- CreateIndex
CREATE INDEX "sophia_memories_founderId_idempotencyKey_idx" ON "sophia_memories"("founderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "company_decisions_creationRequestId_key" ON "company_decisions"("creationRequestId");

-- CreateIndex
CREATE INDEX "company_decisions_status_category_idx" ON "company_decisions"("status", "category");

-- CreateIndex
CREATE INDEX "company_decisions_creationRequestId_idx" ON "company_decisions"("creationRequestId");

-- CreateIndex
CREATE INDEX "company_decisions_proposer_idx" ON "company_decisions"("proposer");

-- CreateIndex
CREATE UNIQUE INDEX "council_deliberations_idempotencyKey_key" ON "council_deliberations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "council_deliberations_leaseStatus_expiresAt_idx" ON "council_deliberations"("leaseStatus", "expiresAt");

-- CreateIndex
CREATE INDEX "council_deliberations_fingerprint_idx" ON "council_deliberations"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "communication_contacts_email_key" ON "communication_contacts"("email");

-- CreateIndex
CREATE INDEX "communication_contacts_email_idx" ON "communication_contacts"("email");

-- CreateIndex
CREATE INDEX "communication_contacts_organizationId_idx" ON "communication_contacts"("organizationId");

-- CreateIndex
CREATE INDEX "communication_messages_conversationId_timestamp_idx" ON "communication_messages"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "communication_messages_deliveryStatus_idx" ON "communication_messages"("deliveryStatus");

-- CreateIndex
CREATE INDEX "communication_webhook_events_provider_eventType_idx" ON "communication_webhook_events"("provider", "eventType");

-- CreateIndex
CREATE INDEX "communication_webhook_events_payloadHash_idx" ON "communication_webhook_events"("payloadHash");
