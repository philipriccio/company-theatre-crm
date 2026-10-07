import type { Block, EmailTemplate } from "./types";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const multiline = (value: string) => escape(value).replace(/\r?\n/g, "<br />");
const url = (value: string) =>
  /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(value)
    ? escape(value)
    : "#";
export function generateHtml(
  blocks: Block[],
  styles: EmailTemplate["styles"],
): string {
  const render = (block: Block): string => {
    switch (block.type) {
      case "text":
        return `<p style="text-align:${escape(block.align)};font-size:${Number(block.fontSize)}px;color:${escape(block.color)};line-height:1.6;margin:0">${multiline(block.content)}</p>`;
      case "heading": {
        const level = [1, 2, 3].includes(block.level) ? block.level : 2;
        const size = { 1: 32, 2: 24, 3: 20 }[level];
        return `<h${level} style="text-align:${escape(block.align)};font-size:${size}px;font-weight:700;line-height:1.3;margin:0;color:${escape(block.color)}">${multiline(block.content)}</h${level}>`;
      }
      case "image": {
        const img = `<img src="${url(block.src)}" alt="${escape(block.alt)}" style="max-width:100%;width:${{ full: "100%", medium: "75%", small: "50%" }[block.width]};height:auto;display:inline-block" />`;
        return block.src
          ? `<div style="text-align:${escape(block.align)}">${block.link ? `<a href="${url(block.link)}">${img}</a>` : img}</div>`
          : "";
      }
      case "button":
        return `<p style="text-align:${escape(block.align)};margin:0"><a href="${url(block.url)}" style="display:${block.fullWidth ? "block" : "inline-block"};padding:14px 28px;background:${escape(block.backgroundColor)};color:${escape(block.textColor)};border-radius:${Number(block.borderRadius)}px;text-decoration:none;font-weight:600;font-size:16px;text-align:center">${multiline(block.text)}</a></p>`;
      case "divider":
        return `<hr style="border:0;border-top:${Number(block.thickness)}px ${escape(block.style)} ${escape(block.color)};margin:8px 0" />`;
      case "spacer":
        return `<div style="height:${Number(block.height)}px"></div>`;
      case "social":
        return `<p style="text-align:${escape(block.align)};margin:0">${block.icons.map((i) => `<a href="${url(i.url)}">${escape(i.platform)}</a>`).join(" · ")}</p>`;
      case "columns":
        return `<table role="presentation" width="100%"><tr>${block.content.map((col) => `<td style="vertical-align:top;padding:${Number(block.gap) / 2}px;width:${100 / block.columns}%">${col.map(render).join("")}</td>`).join("")}</tr></table>`;
    }
  };
  return `<div style="max-width:${Number(styles.maxWidth)}px;margin:auto;background:${escape(styles.contentBackgroundColor)};font-family:${escape(styles.fontFamily)}">${blocks.map((block) => `<div style="margin-bottom:16px">${render(block)}</div>`).join("\n")}</div>`;
}
