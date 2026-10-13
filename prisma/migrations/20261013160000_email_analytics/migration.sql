ALTER TABLE "CampaignRecipient" ADD COLUMN "analyticsVersion" INTEGER, ADD COLUMN "unsubscribedAt" TIMESTAMP(3), ADD COLUMN "complainedAt" TIMESTAMP(3);
CREATE TABLE "EmailAnalyticsEvent" (
 "id" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "source" TEXT NOT NULL, "canonical" BOOLEAN NOT NULL DEFAULT true,
 "occurredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "linkKey" TEXT, "linkLabel" TEXT, "targetUrl" TEXT, "automation" TEXT NOT NULL DEFAULT 'unknown', "detail" TEXT,
 CONSTRAINT "EmailAnalyticsEvent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EmailAnalyticsEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "EmailAnalyticsEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailAnalyticsEvent_eventKey_key" ON "EmailAnalyticsEvent"("eventKey");
CREATE INDEX "EmailAnalyticsEvent_campaignId_canonical_kind_occurredAt_idx" ON "EmailAnalyticsEvent"("campaignId", "canonical", "kind", "occurredAt");
CREATE INDEX "EmailAnalyticsEvent_campaignId_linkKey_recipientId_idx" ON "EmailAnalyticsEvent"("campaignId", "linkKey", "recipientId");
CREATE INDEX "EmailAnalyticsEvent_recipientId_occurredAt_idx" ON "EmailAnalyticsEvent"("recipientId", "occurredAt");
