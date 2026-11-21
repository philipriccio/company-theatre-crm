CREATE TABLE "JtTask" (
 "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "latestUpdate" TEXT NOT NULL DEFAULT '',  "owner" TEXT CHECK ("owner" IN ('PHILIP','JANICE','MILDRED')), "status" TEXT NOT NULL DEFAULT 'TODO' CHECK ("status" IN ('TODO','IN_PROGRESS','WAITING','DONE')),
 "dueDate" TEXT, "notes" TEXT NOT NULL DEFAULT '', "sourceLinks" JSONB NOT NULL DEFAULT '[]', "sourceKey" TEXT UNIQUE, "parentId" TEXT REFERENCES "JtTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "archivedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "JtTask_archivedAt_status_idx" ON "JtTask"("archivedAt","status");
CREATE TABLE "JtTaskChange" ("id" TEXT PRIMARY KEY,"taskId" TEXT NOT NULL REFERENCES "JtTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,"actorId" TEXT NOT NULL,"actorLabel" TEXT NOT NULL,"before" JSONB,"after" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "JtTaskChange_taskId_createdAt_idx" ON "JtTaskChange"("taskId","createdAt");
CREATE TABLE "JtTaskRequest" ("id" TEXT PRIMARY KEY,"hash" TEXT NOT NULL,"result" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TRIGGER jt_task_change_immutable BEFORE UPDATE OR DELETE ON "JtTaskChange" FOR EACH ROW EXECUTE FUNCTION crm_security_immutable();
CREATE TRIGGER jt_task_request_immutable BEFORE UPDATE OR DELETE ON "JtTaskRequest" FOR EACH ROW EXECUTE FUNCTION crm_security_immutable();
