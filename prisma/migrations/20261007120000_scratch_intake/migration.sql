-- Change future defaults only; never rewrite existing audience consent.
ALTER TABLE "Contact" ALTER COLUMN "solicitation" SET DEFAULT false;
CREATE TABLE "ScratchEntry" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT,
  "contactId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScratchEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScratchEntry_submissionId_key" ON "ScratchEntry"("submissionId");
CREATE INDEX "ScratchEntry_promotionId_idx" ON "ScratchEntry"("promotionId");
CREATE INDEX "ScratchEntry_contactId_idx" ON "ScratchEntry"("contactId");
