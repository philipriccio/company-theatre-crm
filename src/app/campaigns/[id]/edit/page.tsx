import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CampaignEditor } from "@/components/campaigns/CampaignEditor";
import type { EmailTemplate } from "@/components/email-builder/types";
export const dynamic = "force-dynamic";
export default async function EditCampaign({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  if (c.status !== "DRAFT")
    return (
      <div className="p-8">
        This campaign is locked. Duplicate it to make a new draft.{" "}
        <Link href={`/campaigns/${id}`}>Back to campaign</Link>
      </div>
    );
  return (
    <CampaignEditor
      initial={{
        id: c.id,
        name: c.name,
        subject: c.subject,
        fromName: c.fromName,
        fromEmail: c.fromEmail,
        replyToEmail: c.replyToEmail,
        previewText: c.previewText,
        content: c.content,
        design: c.design as unknown as EmailTemplate | null,
      }}
    />
  );
}
