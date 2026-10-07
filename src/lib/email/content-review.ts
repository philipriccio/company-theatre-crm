export function reviewEmailContent(html: string) {
  const links = [...html.matchAll(/href=["']([^"']*)["']/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  const uniqueLinks = [...new Set(links)];
  const invalidLinks = uniqueLinks.filter((link) => {
    try {
      const url = new URL(link);
      return (
        !["http:", "https:", "mailto:"].includes(url.protocol) ||
        (url.protocol !== "mailto:" && !url.hostname)
      );
    } catch {
      return true;
    }
  });
  const missingAlt = [...html.matchAll(/<img\b[^>]*>/gi)].filter(
    (m) => !/\balt=["'][^"']+["']/i.test(m[0]),
  ).length;
  return { links: uniqueLinks, invalidLinks, missingAlt };
}
