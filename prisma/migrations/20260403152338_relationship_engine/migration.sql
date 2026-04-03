-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "context" TEXT,
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "organization" TEXT,
ADD COLUMN     "personalNotes" TEXT,
ADD COLUMN     "relationshipHealth" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "authorName" TEXT NOT NULL DEFAULT 'Philip',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInteraction" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "summary" TEXT,
    "emailId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactConnection" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "connectedId" TEXT,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactFollowUp" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactNote_contactId_idx" ON "ContactNote"("contactId");

-- CreateIndex
CREATE INDEX "ContactNote_category_idx" ON "ContactNote"("category");

-- CreateIndex
CREATE INDEX "ContactInteraction_contactId_idx" ON "ContactInteraction"("contactId");

-- CreateIndex
CREATE INDEX "ContactInteraction_occurredAt_idx" ON "ContactInteraction"("occurredAt");

-- CreateIndex
CREATE INDEX "ContactInteraction_type_idx" ON "ContactInteraction"("type");

-- CreateIndex
CREATE INDEX "ContactConnection_contactId_idx" ON "ContactConnection"("contactId");

-- CreateIndex
CREATE INDEX "ContactFollowUp_contactId_idx" ON "ContactFollowUp"("contactId");

-- CreateIndex
CREATE INDEX "ContactFollowUp_dueDate_idx" ON "ContactFollowUp"("dueDate");

-- CreateIndex
CREATE INDEX "ContactFollowUp_completedAt_idx" ON "ContactFollowUp"("completedAt");

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInteraction" ADD CONSTRAINT "ContactInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConnection" ADD CONSTRAINT "ContactConnection_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactFollowUp" ADD CONSTRAINT "ContactFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
