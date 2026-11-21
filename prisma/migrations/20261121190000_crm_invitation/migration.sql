CREATE TABLE "CrmInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "CrmInvitation_email_key" ON "CrmInvitation"("email");
CREATE UNIQUE INDEX "CrmInvitation_tokenHash_key" ON "CrmInvitation"("tokenHash");
