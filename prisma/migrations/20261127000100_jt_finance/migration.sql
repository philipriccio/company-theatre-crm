CREATE TABLE "JtFinanceWorkspace" ("id" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 1, "data" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "JtFinanceChange" ("id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "actorLabel" TEXT NOT NULL, "version" INTEGER NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "JtFinanceRequest" ("id" TEXT PRIMARY KEY, "hash" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "JtFinanceReceipt" ("id" TEXT PRIMARY KEY, "expenseId" TEXT NOT NULL, "filename" TEXT NOT NULL, "mime" TEXT NOT NULL, "bytes" BYTEA NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "JtFinanceReceipt_expenseId_idx" ON "JtFinanceReceipt"("expenseId");
CREATE FUNCTION jt_finance_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Finance audit and receipt records are append-only'; END $$;
CREATE TRIGGER jt_finance_change_append_only BEFORE UPDATE OR DELETE ON "JtFinanceChange" FOR EACH ROW EXECUTE FUNCTION jt_finance_append_only();
CREATE TRIGGER jt_finance_request_append_only BEFORE UPDATE OR DELETE ON "JtFinanceRequest" FOR EACH ROW EXECUTE FUNCTION jt_finance_append_only();
CREATE TRIGGER jt_finance_receipt_append_only BEFORE UPDATE OR DELETE ON "JtFinanceReceipt" FOR EACH ROW EXECUTE FUNCTION jt_finance_append_only();
