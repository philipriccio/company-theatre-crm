import { reviewEmailContent } from "@/lib/email/content-review";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EmailPreview } from "@/components/campaigns/EmailPreview";
import { wrapInTemplate } from "@/lib/email-template";
export const dynamic = "force-dynamic";
export default async function Preview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  const review = reviewEmailContent(c.content);
  const html = wrapInTemplate({
    content: c.content,
    previewText: c.previewText || undefined,
    unsubscribeUrl: "#",
  });
  return (
    <div className="p-4 sm:p-8 space-y-5">
      <Link href={`/campaigns/${id}`} className="underline">
        ← Review campaign
      </Link>
      <h1 className="text-2xl font-semibold">{c.name}</h1>
      <p>
        From: {c.fromName} · {c.fromEmail}
        <br />
        Replies go to: {c.replyToEmail || c.fromEmail}
        <br />
        Subject: {c.subject}
        <br />
        Preview text: {c.previewText || "Not set"}
      </p>
      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Content checks</h2>
        <p>
          {review.invalidLinks.length} incomplete or unsupported links ·{" "}
          {review.missingAlt} images missing descriptive alt text
        </p>
        <p className="text-xs text-stone-500">
          Format check only: destinations and actual inbox rendering have not
          been verified.
        </p>
        <ul className="text-sm break-all space-y-2">
          {review.links.map((link) => (
            <li key={link}>
              {review.invalidLinks.includes(link)
                ? "Needs attention: "
                : "Link: "}
              {link}
            </li>
          ))}
        </ul>
      </section>
      <EmailPreview html={html} />
    </div>
  );
}
