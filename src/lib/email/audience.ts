import { prisma } from "@/lib/db";
export async function selectAudience(mode: string, tagIds: string[] = []) {
  if (
    !["all", "tags"].includes(mode) ||
    !Array.isArray(tagIds) ||
    (mode === "tags" &&
      (!tagIds.length || !tagIds.every((id) => typeof id === "string" && id)))
  )
    throw new Error("Choose all subscribed contacts or at least one tag");
  const tagFilter =
    mode === "tags" ? { tags: { some: { tagId: { in: tagIds } } } } : {};
  const [suppressions, candidates] = await Promise.all([
    prisma.globalSuppression.findMany({ select: { email: true } }),
    prisma.contact.findMany({
      where: tagFilter,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        solicitation: true,
        unsubscribedAt: true,
      },
    }),
  ]);
  const blocked = new Set(suppressions.map((s) => s.email.toLowerCase()));
  const seen = new Set<string>();
  const contacts = candidates.filter((c) => {
    const email = c.email.toLowerCase();
    if (
      !c.solicitation ||
      c.unsubscribedAt ||
      blocked.has(email) ||
      seen.has(email)
    )
      return false;
    seen.add(email);
    return true;
  });
  return {
    contacts,
    matched: candidates.length,
    eligible: contacts.length,
    excluded: candidates.length - contacts.length,
  };
}
