"use client";

import { useEffect, useId, useRef } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Callers typically pass an inline `onClose` (a fresh function identity every render),
  // so this ref keeps the Escape handler current without making the effect below re-run
  // on every keystroke in the modal's own form fields (see next comment).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);

    // Depending only on `open` (not `onClose`) is deliberate: this effect must run once
    // per open/close, not on every parent re-render. It previously depended on `onClose`
    // too, which — since callers pass an inline arrow function — gets a new identity on
    // every keystroke in a controlled field, re-running this effect and re-focusing the
    // *first* focusable element in the panel on each character typed. That element is
    // the header's close (×) button (it precedes the form fields in DOM order), so it
    // visibly stole focus away from whatever the user was typing into.
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not(.modal-panel__close), [tabindex]",
    );
    firstFocusable?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <div className="modal-panel__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
