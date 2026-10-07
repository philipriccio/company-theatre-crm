import { Prisma } from "@prisma/client";
import type { EmailTemplate } from "@/components/email-builder/types";
import { generateHtml } from "@/components/email-builder/render";
export function draftData(body: Record<string, unknown>) {
  const field = (key: string, max = 200) => {
    const value = body[key];
    if (typeof value !== "string" || value.length > max)
      throw new Error(`Invalid ${key}`);
    return value.trim();
  };
  const name = field("name");
  if (!name) throw new Error("Give this campaign a name");
  const subject = field("subject");
  const fromName = field("fromName");
  const fromEmail = field("fromEmail");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail))
    throw new Error("Enter a valid sender email");
  const replyToEmail =
    typeof body.replyToEmail === "string"
      ? body.replyToEmail.trim()
      : fromEmail;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyToEmail))
    throw new Error("Enter a valid reply-to email");
  let design: EmailTemplate | null = null;
  if (body.design != null) {
    const raw = body.design as EmailTemplate;
    if (
      !Array.isArray(raw.blocks) ||
      raw.blocks.length > 100 ||
      !raw.styles ||
      !Number.isFinite(raw.styles.maxWidth) ||
      JSON.stringify(raw).length > 500000
    )
      throw new Error("Invalid email design");
    const allowed = [
      "text",
      "heading",
      "image",
      "button",
      "divider",
      "spacer",
      "columns",
      "social",
    ];
    if (
      raw.blocks.some(
        (b) => !b || !allowed.includes(b.type) || typeof b.id !== "string",
      )
    )
      throw new Error("Invalid email block");
    design = raw;
  }
  const content = design
    ? generateHtml(design.blocks, design.styles)
    : field("content", 1000000);
  return {
    name,
    subject,
    fromName,
    fromEmail,
    replyToEmail,
    previewText: field("previewText", 300),
    content,
    design: design
      ? (JSON.parse(JSON.stringify(design)) as Prisma.InputJsonValue)
      : Prisma.DbNull,
  };
}
