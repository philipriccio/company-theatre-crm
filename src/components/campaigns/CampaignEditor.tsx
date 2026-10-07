"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EmailTemplate } from "@/components/email-builder/types";
import { defaultStyles } from "@/components/email-builder/types";

const EmailBuilder = dynamic(
  () =>
    import("@/components/email-builder/EmailBuilder").then(
      (module) => module.EmailBuilder,
    ),
  { loading: () => <p>Loading visual editor…</p> },
);

type Draft = {
  id?: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  previewText: string | null;
  content: string;
  design: EmailTemplate | null;
  status?: string;
};
type Template = { id: string; name: string; content: string };
const blank: EmailTemplate = {
  name: "Company Theatre email",
  styles: defaultStyles,
  blocks: [
    {
      id: "welcome",
      type: "heading",
      content: "News from The Company Theatre",
      level: 1,
      align: "left",
      color: "#18181b",
    },
    {
      id: "intro",
      type: "text",
      content: "Hello {{firstName}},\n\nWrite your news here.",
      align: "left",
      fontSize: 16,
      color: "#27272a",
    },
  ],
};
const fields = [
  ["name", "Campaign name (internal)"],
  ["subject", "Subject line"],
  ["fromName", "Sender name"],
  ["fromEmail", "Sender email"],
  ["replyToEmail", "Replies go to"],
  ["previewText", "Inbox preview text"],
] as const;

export function CampaignEditor({ initial }: { initial?: Draft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    initial || {
      name: "",
      subject: "",
      fromName: "The Company Theatre",
      fromEmail: "philip@companytheatre.ca",
      replyToEmail: "philip@companytheatre.ca",
      previewText: "",
      content: "",
      design: blank,
    },
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [version, setVersion] = useState(0);
  const touchedFields = useRef(new Set<keyof Draft>());
  const designSnapshot = useRef(JSON.stringify(initial?.design ?? blank));

  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      const response = await fetch("/api/templates");
      if (!response.ok) throw Error("Could not load templates");
      const items = await response.json();
      if (active) setTemplates(items);
    }
    async function loadDefaults() {
      if (initial) return;
      const response = await fetch("/api/settings");
      if (!response.ok) throw Error("Could not load sender defaults");
      const { defaults } = await response.json();
      if (!active) return;
      // A delayed defaults response must never overwrite a user's edits.
      const untouched = Object.fromEntries(
        Object.entries(defaults).filter(
          ([key]) => !touchedFields.current.has(key as keyof Draft),
        ),
      );
      setDraft((current) => ({ ...current, ...untouched }));
    }
    Promise.all([loadTemplates(), loadDefaults()]).catch((cause) => {
      if (active) setError(cause.message);
    });
    return () => {
      active = false;
    };
  }, [initial]);

  useEffect(() => {
    if (!dirty) return;
    const guardUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname && destination.hash)
      )
        return;
      if (!window.confirm("Leave without saving your changes?")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", guardUnload);
    // Capture precedes Next Link handlers, including links in the shared sidebar.
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", guardUnload);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  const changeDesign = useCallback((design: EmailTemplate) => {
    const snapshot = JSON.stringify(design);
    if (designSnapshot.current === snapshot) return;
    designSnapshot.current = snapshot;
    setDirty(true);
    setSaved("");
    setDraft((current) => ({ ...current, design }));
  }, []);

  function changeField(key: keyof Draft, value: string) {
    touchedFields.current.add(key);
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaved("");
  }

  async function save(review = false) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        draft.id ? `/api/campaigns/${draft.id}` : "/api/campaigns",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            previewText: draft.previewText || "",
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not save draft");
      setDraft(data);
      designSnapshot.current = JSON.stringify(data.design);
      setDirty(false);
      setSaved("All changes saved");
      if (review) {
        router.push(`/campaigns/${data.id}`);
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Could not save draft. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function chooseTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    const hasExistingContent = Boolean(
      draft.id || draft.content || draft.design?.blocks.length,
    );
    if (
      hasExistingContent &&
      !window.confirm(
        "Replace the current email design with this template? Your existing design will be replaced when you save.",
      )
    )
      return;
    let design: EmailTemplate | null = null;
    try {
      const parsed = JSON.parse(template.content);
      if (Array.isArray(parsed.blocks) && parsed.styles)
        design = { ...parsed, name: template.name };
    } catch {
      /* Legacy HTML remains intact in advanced mode. */
    }
    designSnapshot.current = JSON.stringify(design);
    setDraft((current) => ({
      ...current,
      design,
      content: design ? "" : template.content,
    }));
    setVersion((current) => current + 1);
    setDirty(true);
    setSaved("");
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <Link href="/campaigns" className="text-sm underline">
        ← Campaigns
      </Link>
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-sm text-stone-500">
            Create → Design → Review → Approved tests → Send
          </p>
          <h1 className="text-3xl font-semibold mt-2">
            {draft.id ? "Edit campaign" : "Create your campaign"}
          </h1>
          <p className="text-stone-500 mt-2">
            Save a draft anytime. Saving never sends an email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-secondary btn-md"
            disabled={saving}
            onClick={() => save()}
          >
            Save draft
          </button>
          <button
            className="btn btn-primary btn-md"
            disabled={saving}
            onClick={() => save(true)}
          >
            Save & review →
          </button>
        </div>
      </header>
      <p role="status" className="text-sm">
        {saving
          ? "Saving…"
          : dirty
            ? "Unsaved changes"
            : saved || "Draft editor"}
      </p>
      {error && (
        <p role="alert" className="p-4 rounded bg-red-50 text-red-800">
          {error} Your changes remain in this editor.
        </p>
      )}
      <fieldset disabled={saving} className="space-y-6 min-w-0">
        <section className="card p-5 grid sm:grid-cols-2 gap-4">
          <h2 className="sm:col-span-2 text-lg font-semibold">
            1. Campaign details
          </h2>
          {fields.map(([key, label]) => (
            <label className="block text-sm min-w-0" key={key}>
              {label}
              <input
                className="input mt-2"
                value={draft[key] || ""}
                onChange={(event) => changeField(key, event.target.value)}
                type={key.includes("Email") ? "email" : "text"}
              />
            </label>
          ))}
        </section>
        <section className="card overflow-hidden">
          <div className="p-5 space-y-3">
            <h2 className="text-lg font-semibold">2. Design your email</h2>
            <label className="block text-sm">
              Start from a saved template
              <select
                aria-label="Choose template"
                className="input mt-2"
                value=""
                onChange={(event) => chooseTemplate(event.target.value)}
              >
                <option value="" disabled>
                  Choose a template…
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.design ? (
            <EmailBuilder
              key={version}
              initialTemplate={draft.design}
              onChange={changeDesign}
              onSave={() => save()}
              saveLabel="Save draft"
            />
          ) : (
            <div className="p-5">
              <p className="mb-3 text-sm text-stone-600">
                This legacy HTML email is preserved as-is. You can edit its HTML
                or choose a visual template above to replace it.
              </p>
              <label className="block">
                Advanced HTML
                <textarea
                  className="input font-mono mt-2"
                  rows={18}
                  value={draft.content}
                  onChange={(event) =>
                    changeField("content", event.target.value)
                  }
                />
              </label>
            </div>
          )}
        </section>
      </fieldset>
      <p className="text-sm text-stone-500">
        Next: review desktop/mobile layout, choose your audience, and request
        Philip’s approval for any test email.
      </p>
    </div>
  );
}
