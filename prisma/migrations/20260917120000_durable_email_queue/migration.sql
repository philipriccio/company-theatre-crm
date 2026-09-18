-- Durable provider-neutral campaign queue and compliance state.

ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_FAILURES';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "CampaignRecipientStatus" AS ENUM ('QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'SUPPRESSED', 'UNKNOWN', 'CANCELLED');
CREATE TYPE "EmailAttemptOutcome" AS ENUM ('ACCEPTED', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'SUPPRESSED', 'UNKNOWN');
CREATE TYPE "EmailProviderEventType" AS ENUM ('ACCEPTED', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'REJECTED', 'DROPPED', 'UNKNOWN');

ALTER TABLE "Campaign" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "audienceMode" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "audienceTagIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "approvalNote" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "frozenRecipientCount" INTEGER;

ALTER TABLE "CampaignRecipient" ADD COLUMN "email" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "firstName" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "lastName" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "fullName" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "CampaignRecipient" ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CampaignRecipient" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "suppressedAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "unknownAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CampaignRecipient" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "leasedUntil" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "provider" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "lastErrorClass" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "lastErrorCode" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "lastErrorMessage" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "metadata" JSONB;

UPDATE "CampaignRecipient" cr
SET "email" = c."email",
    "firstName" = c."firstName",
    "lastName" = c."lastName",
    "fullName" = c."fullName",
    "status" = CASE
      WHEN cr."bouncedAt" IS NOT NULL THEN 'FAILED'::"CampaignRecipientStatus"
      WHEN cr."deliveredAt" IS NOT NULL THEN 'DELIVERED'::"CampaignRecipientStatus"
      WHEN cr."sentAt" IS NOT NULL THEN 'ACCEPTED'::"CampaignRecipientStatus"
      -- Legacy rows without provider acceptance evidence are deliberately
      -- quarantined. They must never become eligible for the new worker merely
      -- because the migration was applied to an old SENDING campaign.
      ELSE 'UNKNOWN'::"CampaignRecipientStatus"
    END,
    "acceptedAt" = cr."sentAt",
    "unknownAt" = CASE WHEN cr."sentAt" IS NULL AND cr."deliveredAt" IS NULL AND cr."bouncedAt" IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
    "lastErrorClass" = CASE WHEN cr."sentAt" IS NULL AND cr."deliveredAt" IS NULL AND cr."bouncedAt" IS NULL THEN 'unknown' ELSE NULL END,
    "lastErrorCode" = CASE WHEN cr."sentAt" IS NULL AND cr."deliveredAt" IS NULL AND cr."bouncedAt" IS NULL THEN 'legacy_unresolved' ELSE NULL END,
    "lastErrorMessage" = CASE WHEN cr."sentAt" IS NULL AND cr."deliveredAt" IS NULL AND cr."bouncedAt" IS NULL THEN 'Legacy recipient had no provider acceptance evidence at migration time' ELSE NULL END
FROM "Contact" c
WHERE c."id" = cr."contactId";

ALTER TABLE "CampaignRecipient" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "CampaignRecipient_campaignId_email_key" ON "CampaignRecipient"("campaignId", "email");
CREATE INDEX "CampaignRecipient_status_nextAttemptAt_idx" ON "CampaignRecipient"("status", "nextAttemptAt");
CREATE INDEX "CampaignRecipient_leasedUntil_idx" ON "CampaignRecipient"("leasedUntil");
CREATE INDEX "CampaignRecipient_providerMessageId_idx" ON "CampaignRecipient"("providerMessageId");

ALTER TABLE "CampaignLink" ADD COLUMN "targetToken" TEXT;
CREATE UNIQUE INDEX "CampaignLink_targetToken_key" ON "CampaignLink"("targetToken");

CREATE TABLE "EmailDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "outcome" "EmailAttemptOutcome" NOT NULL,
  "errorClass" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "providerMessageId" TEXT,
  CONSTRAINT "EmailDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailProviderEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "eventType" "EmailProviderEventType" NOT NULL,
  "campaignId" TEXT,
  "recipientId" TEXT,
  "emailHash" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "contactId" TEXT,
  "campaignId" TEXT,
  "recipientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "GlobalSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsentEvidence" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "ConsentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailDeliveryAttempt_campaignId_idx" ON "EmailDeliveryAttempt"("campaignId");
CREATE INDEX "EmailDeliveryAttempt_recipientId_idx" ON "EmailDeliveryAttempt"("recipientId");
CREATE INDEX "EmailDeliveryAttempt_providerMessageId_idx" ON "EmailDeliveryAttempt"("providerMessageId");
CREATE UNIQUE INDEX "EmailProviderEvent_provider_providerEventId_key" ON "EmailProviderEvent"("provider", "providerEventId");
CREATE INDEX "EmailProviderEvent_providerMessageId_idx" ON "EmailProviderEvent"("providerMessageId");
CREATE INDEX "EmailProviderEvent_recipientId_idx" ON "EmailProviderEvent"("recipientId");
CREATE INDEX "EmailProviderEvent_eventType_idx" ON "EmailProviderEvent"("eventType");
CREATE UNIQUE INDEX "GlobalSuppression_email_key" ON "GlobalSuppression"("email");
CREATE UNIQUE INDEX "GlobalSuppression_emailHash_key" ON "GlobalSuppression"("emailHash");
CREATE INDEX "GlobalSuppression_reason_idx" ON "GlobalSuppression"("reason");
CREATE INDEX "GlobalSuppression_contactId_idx" ON "GlobalSuppression"("contactId");
CREATE INDEX "ConsentEvidence_contactId_idx" ON "ConsentEvidence"("contactId");
CREATE INDEX "ConsentEvidence_email_idx" ON "ConsentEvidence"("email");

ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
