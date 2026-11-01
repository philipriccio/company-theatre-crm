ALTER TABLE "CrmAuthEvent" ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'legacy', ADD COLUMN "actorLabel" TEXT NOT NULL DEFAULT 'Historical attribution not verified', ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'unknown', ADD COLUMN "resourceId" TEXT;
CREATE INDEX "CrmAuthEvent_kind_createdAt_idx" ON "CrmAuthEvent"("kind","createdAt");
CREATE INDEX "CrmAuthEvent_userId_createdAt_idx" ON "CrmAuthEvent"("userId","createdAt");
CREATE TABLE "CrmSecurityAlert" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL, "rule" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewedAt" TIMESTAMP(3), "reviewedBy" TEXT, "reviewerName" TEXT
);
CREATE INDEX "CrmSecurityAlert_createdAt_idx" ON "CrmSecurityAlert"("createdAt");
CREATE TABLE "CrmSecurityCoverage" ("id" TEXT PRIMARY KEY, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "CrmSecurityCoverage" ("id","startedAt") VALUES ('security-history-v1',timezone('UTC',clock_timestamp()));
-- Shared insert boundary covers both pg auth/operator and Prisma business transactions.
CREATE FUNCTION crm_security_event_normalize() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE label TEXT;
BEGIN
 NEW."createdAt"=timezone('UTC',clock_timestamp());
 NEW."details" = jsonb_strip_nulls(jsonb_build_object('status',NEW."details"->'status','method',NEW."details"->'method','scope',NEW."details"->'scope','subject',NEW."details"->'subject','count',NEW."details"->'count','sessions',NEW."details"->'sessions','throttles',NEW."details"->'throttles'));
 IF octet_length(NEW."details"::text)>1024 THEN RAISE EXCEPTION 'Audit details exceed limit'; END IF;
 NEW."outcome"=CASE WHEN NEW."kind" ~ '_unknown$' THEN 'unknown' WHEN NEW."kind" ~ '(failed|denied|blocked)' THEN 'failure' WHEN NEW."kind" ~ '(requested|authorized_request|started)$' THEN 'attempt' ELSE 'success' END;
 IF NEW."kind" LIKE 'operator_%' THEN
   NEW."resourceId"=NEW."userId"; NEW."userId"=NULL; NEW."actorType"='system'; NEW."actorLabel"='Private operator (person not attested)';
 ELSIF NEW."userId" IS NULL THEN
   NEW."actorType"=CASE WHEN NEW."kind"='auth_housekeeping' THEN 'system' ELSE 'unknown' END;
   NEW."actorLabel"=CASE WHEN NEW."kind"='auth_housekeeping' THEN 'Auth housekeeping' ELSE 'Unverified actor' END;
 ELSE
   SELECT "name" INTO label FROM "CrmUser" WHERE "id"=NEW."userId";
   IF FOUND THEN NEW."actorType"='human'; NEW."actorLabel"=left(label,120);
   ELSE
     SELECT "name" INTO label FROM "CrmMachineIdentity" WHERE "id"=NEW."userId";
     IF FOUND THEN NEW."actorType"='machine'; NEW."actorLabel"=left(label,120);
     ELSE RAISE EXCEPTION 'Unknown security actor'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_security_normalize BEFORE INSERT ON "CrmAuthEvent" FOR EACH ROW EXECUTE FUNCTION crm_security_event_normalize();
CREATE FUNCTION crm_security_alert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject TEXT; rule TEXT; reason TEXT; alert_id TEXT; n INT;
BEGIN
 IF NEW."kind" IN ('password_changed_all_sessions_rotated','operator_recover','operator_disable-human','operator_machine-issue','operator_machine-rotate','operator_machine-revoke','campaign_send_approved','campaign_review_approve') THEN
  rule='sensitive-change'; reason='Sensitive account, machine-access or sending authorization changed. Confirm it was expected.'; alert_id=NEW."id";
 ELSIF NEW."kind" IN ('login_failed','access_denied','machine_scope_denied','export_started') THEN
  subject=COALESCE(NEW."userId",NEW."details"->>'subject','unverified-global');
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."kind"||subject,0));
  SELECT count(*) INTO n FROM (SELECT 1 FROM "CrmAuthEvent" WHERE "kind"=NEW."kind" AND COALESCE("userId","details"->>'subject','unverified-global')=subject AND "createdAt">=NEW."createdAt"-INTERVAL '15 minutes' LIMIT 5) recent;
  IF n<5 THEN RETURN NEW; END IF;
  rule='repeated-'||NEW."kind"; reason='At least 5 '||replace(NEW."kind",'_', ' ')||' events for this identity or unverified subject within 15 minutes. Review; this is not proof of compromise.';
  alert_id=md5(rule||subject||floor(extract(epoch FROM NEW."createdAt")/900)::text);
 ELSIF NEW."kind"='throttle_blocked' THEN
  rule='rate-limit'; reason='An authentication or audit rate limit was reached. Some subsequent denials may be suppressed.'; alert_id=NEW."id";
 ELSE RETURN NEW;
 END IF;
 INSERT INTO "CrmSecurityAlert" ("id","eventId","rule","reason","createdAt") VALUES (alert_id,NEW."id",rule,reason,NEW."createdAt") ON CONFLICT ("id") DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_security_detect AFTER INSERT ON "CrmAuthEvent" FOR EACH ROW EXECUTE FUNCTION crm_security_alert();
CREATE FUNCTION crm_security_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Security events are append-only'; END $$;
CREATE TRIGGER crm_security_immutable BEFORE UPDATE OR DELETE ON "CrmAuthEvent" FOR EACH ROW EXECUTE FUNCTION crm_security_immutable();
CREATE INDEX "CrmAuthEvent_subject_kind_time_idx" ON "CrmAuthEvent" ((COALESCE("userId","details"->>'subject','unverified-global')),"kind","createdAt");
CREATE FUNCTION crm_security_alert_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Security alerts cannot be deleted'; END IF;
 IF OLD."reviewedAt" IS NOT NULL OR NEW."id"<>OLD."id" OR NEW."eventId"<>OLD."eventId" OR NEW."rule"<>OLD."rule" OR NEW."reason"<>OLD."reason" OR NEW."createdAt"<>OLD."createdAt" OR NEW."reviewedAt" IS NULL OR NEW."reviewedBy" IS NULL OR NEW."reviewerName" IS NULL THEN RAISE EXCEPTION 'Only first alert review may be recorded'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_security_alert_guard BEFORE UPDATE OR DELETE ON "CrmSecurityAlert" FOR EACH ROW EXECUTE FUNCTION crm_security_alert_review_guard();
