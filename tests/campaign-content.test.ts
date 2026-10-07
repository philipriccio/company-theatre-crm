import assert from "node:assert/strict";
import test from "node:test";
import { generateHtml } from "../src/components/email-builder/render";
import {
  defaultStyles,
  type Block,
} from "../src/components/email-builder/types";
import { reviewEmailContent } from "../src/lib/email/content-review";
import { draftData } from "../src/lib/campaign-draft";
test("visual email renderer escapes editable text and attributes, includes social and nested legacy blocks without scripts", () => {
  const blocks: Block[] = [
    {
      id: "heading",
      type: "heading",
      content: "<script>bad()</script>",
      level: 1,
      align: "left",
      color: "#000",
    },
    {
      id: "button",
      type: "button",
      text: "Buy",
      url: "javascript:alert(1)",
      align: "left",
      backgroundColor: "#000",
      textColor: "#fff",
      borderRadius: 4,
      fullWidth: false,
    },
    {
      id: "social",
      type: "social",
      align: "center",
      icons: [{ platform: "instagram", url: "https://instagram.com/company" }],
    },
    {
      id: "columns",
      type: "columns",
      columns: 2,
      gap: 16,
      content: [
        [
          {
            id: "text",
            type: "text",
            content: "Nested content",
            align: "left",
            fontSize: 16,
            color: "#000",
          },
        ],
        [],
      ],
    },
  ];
  const html = generateHtml(blocks, defaultStyles);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("javascript:"));
  assert.match(html, /Nested content/);
  assert.match(html, /instagram.com\/company/);
  assert.equal(reviewEmailContent(html).invalidLinks.length, 1);
});
test("legacy HTML is preserved and design JSON is never treated as outgoing HTML", () => {
  const base = {
    name: "Legacy",
    subject: "Subject",
    fromName: "Company",
    fromEmail: "sender@example.com",
    previewText: "",
    content: "<div>Existing HTML</div>",
  };
  assert.equal(draftData(base).content, base.content);
  assert.throws(
    () => draftData({ ...base, design: { blocks: "not blocks" } }),
    /Invalid email design/,
  );
  const review = reviewEmailContent(
    '<a href="https://">Missing</a><img src="x"><a href="https://example.com">Valid</a>',
  );
  assert.equal(review.invalidLinks.length, 1);
  assert.equal(review.missingAlt, 1);
});

test("chosen heading levels, sizes and multiline content survive HTML export", () => {
  const blocks: Block[] = [
    {
      id: "h1",
      type: "heading",
      level: 1,
      content: "First\nSecond",
      align: "center",
      color: "#123456",
    },
    {
      id: "h3",
      type: "heading",
      level: 3,
      content: "Small",
      align: "right",
      color: "#000000",
    },
    {
      id: "p",
      type: "text",
      content: "One\nTwo",
      align: "left",
      fontSize: 18,
      color: "#000000",
    },
  ];
  const html = generateHtml(blocks, defaultStyles);
  assert.match(
    html,
    /<h1 style="[^"]*font-size:32px[^\"]*">First<br \/>Second<\/h1>/,
  );
  assert.match(html, /<h3 style="[^"]*font-size:20px/);
  assert.match(html, /One<br \/>Two/);
  assert.match(html, /text-align:center/);
});
