-- AlterTable: Add optimistic concurrency stateVersion and worker claim fields to workflow_instances
ALTER TABLE "workflow_instances" ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "workflow_instances" ADD COLUMN "claimedBy" TEXT;
ALTER TABLE "workflow_instances" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "workflow_instances_status_stateVersion_idx" ON "workflow_instances"("status", "stateVersion");
