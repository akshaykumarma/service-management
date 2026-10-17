"use client";

import { useCallback, useEffect, useState } from "react";

interface TemplateEditorState {
  approved: { body: string; metaTemplateName: string | null; updatedAt: string | null };
  pending: { body: string; updatedAt: string } | null;
}

const TEMPLATE_TYPES = ["ticket_created", "completion", "otp", "demo_created", "demo_completed"] as const;
type TemplateType = (typeof TEMPLATE_TYPES)[number];

type TemplatesResponse = Record<TemplateType, TemplateEditorState>;

const LABELS: Record<TemplateType, string> = {
  ticket_created: "Ticket created notification",
  completion: "Completion notification",
  otp: "OTP delivery verification",
  demo_created: "Demo ticket created notification",
  demo_completed: "Demo completed notification",
};

const DESCRIPTIONS: Record<TemplateType, string> = {
  ticket_created: "Sent to the customer when a service ticket is created, with their ticket number.",
  completion: "Sent to the customer the first time the service is completed: the machine is ready for pickup.",
  otp: "Sent to the customer at delivery with the one-time code that confirms the pickup.",
  demo_created: "Sent to the customer when a demo ticket is created, with the ticket number and demo date.",
  demo_completed: "Sent to the customer the first time a demo is completed, with the demo service amount.",
};

const emptyByType = <T,>(value: T) => Object.fromEntries(TEMPLATE_TYPES.map((t) => [t, value])) as Record<TemplateType, T>;

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplatesResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<TemplateType, string>>(emptyByType(""));
  const [saveError, setSaveError] = useState<Record<TemplateType, string | null>>(emptyByType<string | null>(null));
  const [testPhone, setTestPhone] = useState<Record<TemplateType, string>>(emptyByType(""));
  const [preview, setPreview] = useState<Record<TemplateType, string | null>>(emptyByType<string | null>(null));

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    const body: TemplatesResponse = await res.json();
    setTemplates(body);
    setDrafts(
      Object.fromEntries(
        TEMPLATE_TYPES.map((type) => [type, body[type].pending?.body ?? body[type].approved.body]),
      ) as Record<TemplateType, string>,
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(type: TemplateType) {
    setSaveError((prev) => ({ ...prev, [type]: null }));
    const res = await fetch(`/api/templates/${type}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: drafts[type] }),
    });
    if (res.ok) {
      await load();
      return;
    }
    const body = await res.json();
    setSaveError((prev) => ({
      ...prev,
      [type]: body.error.code === "unsupported_placeholder" ? `Unsupported placeholder: {{${body.error.token}}}` : "Could not save.",
    }));
  }

  async function handleTestSend(type: TemplateType, usePending: boolean) {
    const res = await fetch(`/api/templates/${type}/test-send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: testPhone[type], usePending }),
    });
    const body = await res.json();
    setPreview((prev) => ({ ...prev, [type]: body.renderedContent }));
  }

  if (!templates) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Message templates</h1>
      <p>
        Editing a template does not take effect immediately — it must first be approved by Meta&apos;s WhatsApp
        Business review before it is used for real sends. Until then, the previously-approved wording keeps being
        sent.
      </p>

      {TEMPLATE_TYPES.map((type) => {
        const state = templates[type];
        return (
          <section key={type} aria-labelledby={`${type}-heading`}>
            <h2 id={`${type}-heading`}>{LABELS[type]}</h2>
            <p className="muted">{DESCRIPTIONS[type]}</p>

            <dl>
              <dt>Currently approved (live)</dt>
              <dd style={{ whiteSpace: "pre-line" }}>{state.approved.body}</dd>
            </dl>

            {state.pending ? (
              <p role="status">Pending Meta approval: &quot;{state.pending.body}&quot;</p>
            ) : (
              <p>No pending edit.</p>
            )}

            <div>
              <label htmlFor={`${type}-body`}>Edit wording</label>
              <textarea
                id={`${type}-body`}
                value={drafts[type]}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [type]: e.target.value }))}
              />
            </div>
            {saveError[type] && (
              <p role="alert" aria-live="assertive">
                {saveError[type]}
              </p>
            )}
            <button type="button" onClick={() => handleSave(type)}>
              Submit for approval
            </button>

            <div>
              <label htmlFor={`${type}-test-phone`}>Test-send phone number</label>
              <input
                id={`${type}-test-phone`}
                value={testPhone[type]}
                onChange={(e) => setTestPhone((prev) => ({ ...prev, [type]: e.target.value }))}
              />
              <button type="button" onClick={() => handleTestSend(type, true)} disabled={!testPhone[type]}>
                Preview pending wording (no send)
              </button>
              <button type="button" onClick={() => handleTestSend(type, false)} disabled={!testPhone[type]}>
                Send real test with approved wording
              </button>
            </div>
            {preview[type] && (
              <p aria-live="polite">
                Rendered: <em style={{ whiteSpace: "pre-line" }}>{preview[type]}</em>
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
