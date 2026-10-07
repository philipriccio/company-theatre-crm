CREATE TABLE "CampaignReview" (
 "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
 "action" TEXT NOT NULL, "author" TEXT NOT NULL, "note" TEXT NOT NULL,
 "snapshot" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CampaignReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignReview_campaignId_createdAt_idx" ON "CampaignReview"("campaignId", "createdAt");
CREATE FUNCTION protect_campaign_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Campaign review history is immutable';
END $$;
CREATE TRIGGER campaign_review_immutable BEFORE UPDATE OR DELETE ON "CampaignReview"
FOR EACH ROW EXECUTE FUNCTION protect_campaign_review();
