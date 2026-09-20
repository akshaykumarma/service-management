"use client";

import { useCallback, useEffect, useState } from "react";

interface TemplateEditorState {
  approved: { body: string; metaTemplateName: string | null; updatedAt: string | null };
  pending: { body: string; updatedAt: string } | null;
}

interface TemplatesResponse {
  completion: TemplateEditorState;
  otp: TemplateEditorState;
}

type TemplateType = "completion" | "otp";

const LABELS: Record<TemplateType, string> = {
  completion: "Completion notification",
  otp: "OTP delivery verification",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplatesResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<TemplateType, string>>({ completion: "", otp: "" });
  const [saveError, setSaveError] = useState<Record<TemplateType, string | null>>({ completion: null, otp: null });
  const [testPhone, setTestPhone] = useState<Record<TemplateType, string>>({ completion: "", otp: "" });
  const [preview, setPreview] = useState<Record<TemplateType, string | null>>({ completion: null, otp: null });

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    const body: TemplatesResponse = await res.json();
    setTemplates(body);
    setDrafts({
      completion: body.completion.pending?.body ?? body.completion.approved.body,
      otp: body.otp.pending?.body ?? body.otp.approved.body,
    });
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

      {(["completion", "otp"] as TemplateType[]).map((type) => {
        const state = templates[type];
        return (
          <section key={type} aria-labelledby={`${type}-heading`}>
            <h2 id={`${type}-heading`}>{LABELS[type]}</h2>

            <dl>
              <dt>Currently approved (live)</dt>
              <dd>{state.approved.body}</dd>
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
                Rendered: <em>{preview[type]}</em>
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
