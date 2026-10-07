"use client";
import { useState } from "react";
export function EmailPreview({ html }: { html: string }) {
  const [mobile, setMobile] = useState(false);
  const [sample, setSample] = useState(false);
  const displayedHtml = sample
    ? html.replace(
        /{{\s*(firstName|lastName|fullName|email)\s*}}/g,
        (_match, key: string) =>
          ({
            firstName: "Alex",
            lastName: "Example",
            fullName: "Alex Example",
            email: "alex@example.com",
          })[key] || "",
      )
    : html;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-secondary btn-md"
          aria-pressed={!mobile}
          onClick={() => setMobile(false)}
        >
          Desktop
        </button>
        <button
          className="btn btn-secondary btn-md"
          aria-pressed={mobile}
          onClick={() => setMobile(true)}
        >
          Mobile
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sample}
          onChange={(event) => setSample(event.target.checked)}
        />{" "}
        Show synthetic sample personalization (Alex Example — not a real
        contact)
      </label>
      <p className="text-xs text-stone-500">
        Browser preview only. Real inbox rendering must be checked in approved
        tests. Links and scripts are disabled in this preview. The proposed footer still needs approval and hello mailbox routing verification.
      </p>
      <div className="bg-stone-100 p-2 sm:p-4 rounded-xl">
        <iframe
          title="Email layout preview"
          sandbox=""
          srcDoc={displayedHtml.replace(/\bhref\s*=/gi, "data-preview-href=")}
          className="bg-white border-0 mx-auto max-w-full"
          style={{ width: mobile ? 375 : 680, height: 700 }}
        />
      </div>
    </div>
  );
}
