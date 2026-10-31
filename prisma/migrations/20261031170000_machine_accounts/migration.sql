CREATE TABLE "CrmMachineIdentity" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "scopes" TEXT[] NOT NULL,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "CrmMachineIdentity_expiresAt_idx" ON "CrmMachineIdentity"("expiresAt");
ALTER TABLE "CrmAuthEvent" ADD COLUMN "details" JSONB;
