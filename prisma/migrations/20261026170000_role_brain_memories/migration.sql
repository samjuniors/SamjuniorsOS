-- CreateTable
CREATE TABLE "role_brain_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "memoryScope" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "taskContext" TEXT,
    "provenance" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "role_brain_memories_agentId_memoryScope_updatedAt_idx" ON "role_brain_memories"("agentId", "memoryScope", "updatedAt");

-- CreateIndex
CREATE INDEX "role_brain_memories_agentId_taskContext_idx" ON "role_brain_memories"("agentId", "taskContext");
