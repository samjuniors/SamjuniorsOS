-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FOUNDER', 'EXECUTIVE', 'AUDITOR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'FOUNDER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_state" (
    "id" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_knowledge" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_memories" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "category" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "importance" INTEGER NOT NULL DEFAULT 1,
    "decayScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "objective" TEXT NOT NULL,
    "stepStates" JSONB NOT NULL DEFAULT '{}',
    "context" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_work_items" (
    "id" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_records" (
    "id" TEXT NOT NULL,
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
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "scope" JSONB NOT NULL DEFAULT '{}',
    "founderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "side_effect_audits" (
    "id" TEXT NOT NULL,
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
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_effect_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_metrics" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epistemic_sources" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "uri" TEXT,
    "title" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "provenanceKind" TEXT NOT NULL DEFAULT 'live_operational',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epistemic_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epistemic_signals" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "extractedObservation" TEXT NOT NULL,
    "data" JSONB,
    "confidence" TEXT NOT NULL DEFAULT 'high_confidence',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epistemic_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epistemic_claims" (
    "id" TEXT NOT NULL,
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
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epistemic_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epistemic_verifications" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "policyOutcome" TEXT NOT NULL,
    "conflictingFactIds" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT NOT NULL,
    "precedenceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epistemic_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_facts" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sourceId" TEXT,
    "statement" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "validityState" TEXT NOT NULL DEFAULT 'active',
    "supersededById" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'verified_fact',
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedBy" TEXT NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "payloadHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "executionRef" TEXT,
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributed_leases" (
    "resourceKey" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributed_leases_pkey" PRIMARY KEY ("resourceKey")
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
CREATE INDEX "scheduled_work_items_status_executeAt_idx" ON "scheduled_work_items"("status", "executeAt");

-- CreateIndex
CREATE INDEX "scheduled_work_items_workflowInstanceId_stepId_idx" ON "scheduled_work_items"("workflowInstanceId", "stepId");

-- CreateIndex
CREATE INDEX "scheduled_work_items_idempotencyKey_idx" ON "scheduled_work_items"("idempotencyKey");

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
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_status_createdAt_idx" ON "idempotency_records"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_payloadHash_idx" ON "idempotency_records"("payloadHash");

-- CreateIndex
CREATE INDEX "distributed_leases_expiresAt_idx" ON "distributed_leases"("expiresAt");

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_effect_audits" ADD CONSTRAINT "side_effect_audits_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epistemic_signals" ADD CONSTRAINT "epistemic_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epistemic_claims" ADD CONSTRAINT "epistemic_claims_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epistemic_claims" ADD CONSTRAINT "epistemic_claims_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "epistemic_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epistemic_claims" ADD CONSTRAINT "epistemic_claims_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epistemic_verifications" ADD CONSTRAINT "epistemic_verifications_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "epistemic_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_facts" ADD CONSTRAINT "canonical_facts_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "epistemic_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_facts" ADD CONSTRAINT "canonical_facts_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_facts" ADD CONSTRAINT "canonical_facts_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "canonical_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

