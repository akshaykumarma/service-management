"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/format/date";
import SearchableSelect from "@/components/searchable-select";

interface DemoTicketDetail {
  id: string;
  ticketNumber: string;
  status: string;
  storeId: string;
  storeName: string | null;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceId: string;
  demoServiceName: string;
  demoServicePrice: number;
  demoDate: string;
  createdAt: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  assignedTechnicianHasPhone: boolean;
  shortUrl: string;
}

interface DemoHistory {
  entries: { id: string; ticketNumber: string; status: string; demoServiceName: string; demoDate: string; serialNumber: string; invoiceNumber: string }[];
  activeCount: number;
  warning: boolean;
}

interface ActivityEntry {
  source: string;
  actor: string | null;
  timestamp: string;
  description: string;
}

interface Option {
  id: string;
  name: string;
}

type Draft = {
  customerName: string;
  customerPhone: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceId: string;
  demoDate: string;
};

const STATUSES = ["new", "assigned", "in_progress", "completed", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const LOCKED = new Set(["completed", "cancelled"]);

const STATUS_ERRORS: Record<string, string> = {
  comment_required: "A comment is required for this change.",
  invalid_transition: "That status change isn't allowed from the current status.",
  role_not_permitted: "Your role doesn't permit this status change.",
  technician_required: "Assign a technician first — that moves the ticket to Assigned.",
};

const EDIT_ERRORS: Record<string, string> = {
  ticket_locked: "Details can't be edited once a demo is Completed or Cancelled.",
  invalid_demo_service: "Choose an active demo service.",
  invalid_demo_date: "Enter a valid demo date.",
  demo_date_before_received: "The demo date can't be before the received date.",
};

const FIELD_NAMES: Record<string, string> = {
  customerName: "customer name",
  customerPhone: "phone number",
  machineModel: "model number",
  serialNumber: "serial number",
  invoiceNumber: "invoice number",
  demoServiceId: "demo service",
  demoDate: "demo date",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 008-demo-board US5: a demo ticket's page, mirroring the service ticket page's layout. */
export default function DemoTicketPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<DemoTicketDetail | null>(null);
  const [demoHistory, setDemoHistory] = useState<DemoHistory | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "activity">("overview");

  const [toStatus, setToStatus] = useState("");
  const [comment, setComment] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const lastLoadedStatus = useRef<string | null>(null);

  const [technicians, setTechnicians] = useState<Option[]>([]);
  const [technicianSelection, setTechnicianSelection] = useState("");
  const [assignMessage, setAssignMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [demoServices, setDemoServices] = useState<Option[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/demo-tickets/${params.id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const body = await res.json();
    setTicket(body.ticket);
    setDemoHistory(body.demoHistory);
    setTechnicianSelection(body.ticket.assignedTechnicianId ?? "");
    if (lastLoadedStatus.current !== body.ticket.status) {
      lastLoadedStatus.current = body.ticket.status;
      setToStatus(body.ticket.status);
    }
    const activityRes = await fetch(`/api/demo-tickets/${params.id}/activity`);
    if (activityRes.ok) setActivity((await activityRes.json()).entries);
  }, [params.id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((body) => setRole(body.user?.role ?? null));
    fetch("/api/catalogue/demo-services")
      .then((res) => (res.ok ? res.json() : { demoServices: [] }))
      .then((body) => setDemoServices(body.demoServices));
  }, []);

  const canManage = role !== null && role !== "technician";
  const storeId = ticket?.storeId;

  useEffect(() => {
    if (!canManage || !storeId) return;
    fetch(`/api/technicians?storeId=${storeId}`)
      .then((res) => (res.ok ? res.json() : { technicians: [] }))
      .then((body) => setTechnicians(body.technicians));
  }, [canManage, storeId]);

  async function handleStatusChange(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/demo-tickets/${params.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, comment: comment || null }),
      });
      if (res.ok) {
        setComment("");
        await load();
        return;
      }
      const body = await res.json();
      setStatusError(STATUS_ERRORS[body.error.code] ?? "Could not update the status.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssignMessage(null);
    setAssigning(true);
    try {
      const res = await fetch(`/api/demo-tickets/${params.id}/assign-technician`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ technicianId: technicianSelection || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAssignMessage({
          text: body.error.code === "invalid_technician" ? "Not an active technician in this store." : "Could not update the assignment.",
          ok: false,
        });
        return;
      }
      setAssignMessage(
        body.whatsapp === "queued"
          ? { text: "Assigned. The technician has been sent a WhatsApp message with the ticket link.", ok: true }
          : body.whatsapp === "no_phone"
            ? { text: "Assigned, but no WhatsApp message was sent: this technician has no WhatsApp number (add one on the Team page).", ok: false }
            : { text: technicianSelection ? "Assignment saved." : "Technician removed.", ok: true },
      );
      await load();
    } finally {
      setAssigning(false);
    }
  }

  function startEditing() {
    if (!ticket) return;
    setEditError(null);
    setDraft({
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      machineModel: ticket.machineModel,
      serialNumber: ticket.serialNumber,
      invoiceNumber: ticket.invoiceNumber,
      demoServiceId: ticket.demoServiceId,
      demoDate: ticket.demoDate,
    });
    setEditing(true);
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !ticket) return;
    setEditError(null);
    setSavingDetails(true);
    try {
      // The ticket's own (possibly now inactive) demo service isn't re-validated unless it changes.
      const payload: Partial<Draft> = { ...draft };
      if (payload.demoServiceId === ticket.demoServiceId) delete payload.demoServiceId;
      const res = await fetch(`/api/demo-tickets/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditing(false);
        await load();
        return;
      }
      const body = await res.json();
      setEditError(
        body.error.code === "missing_required_field"
          ? `Please fill in the ${FIELD_NAMES[body.error.field] ?? body.error.field}.`
          : (EDIT_ERRORS[body.error.code] ?? "Could not save the details."),
      );
    } finally {
      setSavingDetails(false);
    }
  }

  async function copyLink() {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (notFound) {
    return (
      <main>
        <p>No such demo ticket.</p>
      </main>
    );
  }
  if (!ticket) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const locked = LOCKED.has(ticket.status);
  // The ticket's current service stays selectable while editing even if since deactivated.
  const serviceOptions = demoServices.some((s) => s.id === ticket.demoServiceId)
    ? demoServices
    : [{ id: ticket.demoServiceId, name: `${ticket.demoServiceName} (inactive)` }, ...demoServices];

  return (
    <main className="ticket-page">
      <header className="ticket-header">
        <div className="ticket-header__main">
          <div className="ticket-header__meta">
            <span className="ticket-header__number">{ticket.ticketNumber}</span>
            <span className={`status-pill status-${ticket.status}`}>{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
            <span className="ticket-kind-badge">Demo</span>
          </div>
          <h1>{ticket.customerName}</h1>
          <p className="ticket-header__sub">
            {ticket.machineModel} · SN {ticket.serialNumber} · Demo on {formatDate(ticket.demoDate)}
          </p>
        </div>
        <a className="button-link" href="/demo-board">
          Demo Board
        </a>
      </header>

      <div className="ticket-tabs" role="tablist" aria-label="Demo ticket sections">
        {(
          [
            ["overview", "Overview"],
            ["activity", `Activity${activity.length ? ` (${activity.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ticket-grid" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <div className="ticket-grid__main">
            <section className="card" aria-labelledby="demo-details-heading">
              <div className="card__header">
                <h2 id="demo-details-heading">Customer &amp; demo</h2>
                {canManage && !locked && !editing && (
                  <button type="button" onClick={startEditing}>
                    Edit details
                  </button>
                )}
              </div>
              {editing && draft ? (
                <form onSubmit={handleSaveDetails} noValidate className="details-form">
                  {(
                    [
                      ["customerName", "Customer name", "text"],
                      ["customerPhone", "Phone number", "tel"],
                      ["machineModel", "Model number", "text"],
                      ["serialNumber", "Serial number", "text"],
                      ["invoiceNumber", "Invoice number", "text"],
                    ] as const
                  ).map(([key, label, type]) => (
                    <div key={key}>
                      <label htmlFor={`edit-${key}`} className="required">
                        {label}
                      </label>
                      <input id={`edit-${key}`} type={type} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                    </div>
                  ))}
                  <div>
                    <label htmlFor="edit-demoDate" className="required">
                      Demo date
                    </label>
                    <input id="edit-demoDate" type="date" value={draft.demoDate} onChange={(e) => setDraft({ ...draft, demoDate: e.target.value })} />
                  </div>
                  <div className="details-form__wide">
                    <label htmlFor="edit-demoServiceId" className="required">
                      Demo service
                    </label>
                    <select id="edit-demoServiceId" value={draft.demoServiceId} onChange={(e) => setDraft({ ...draft, demoServiceId: e.target.value })}>
                      {serviceOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editError && (
                    <p role="alert" aria-live="assertive" className="details-form__wide form-error">
                      {editError}
                    </p>
                  )}
                  <div className="details-form__wide card__actions">
                    <button type="button" onClick={() => setEditing(false)} disabled={savingDetails}>
                      Cancel
                    </button>
                    <button type="submit" disabled={savingDetails}>
                      Save details
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="detail-list">
                  <dt>Customer</dt>
                  <dd>{ticket.customerName}</dd>
                  <dt>Phone</dt>
                  <dd>{ticket.customerPhone}</dd>
                  <dt>Model</dt>
                  <dd>{ticket.machineModel}</dd>
                  <dt>Serial number</dt>
                  <dd className="mono">{ticket.serialNumber}</dd>
                  <dt>Invoice number</dt>
                  <dd className="mono">{ticket.invoiceNumber}</dd>
                  <dt>Demo service</dt>
                  <dd>
                    {ticket.demoServiceName} · {inr(ticket.demoServicePrice)}
                  </dd>
                  <dt>Demo date</dt>
                  <dd>{formatDate(ticket.demoDate)}</dd>
                  <dt>Status</dt>
                  <dd>{STATUS_LABELS[ticket.status] ?? ticket.status}</dd>
                  <dt>Store</dt>
                  <dd>{ticket.storeName ?? "—"}</dd>
                  <dt>Received</dt>
                  <dd>{formatDateTime(ticket.createdAt)}</dd>
                </dl>
              )}
            </section>

            <section className="card" aria-labelledby="demo-history-card-heading">
              <h2 id="demo-history-card-heading">Demo history</h2>
              {demoHistory?.warning && (
                <p className="demo-warning">
                  This machine or invoice already has {demoHistory.activeCount} other demo{demoHistory.activeCount === 1 ? "" : "s"}.
                </p>
              )}
              {demoHistory && demoHistory.entries.length > 0 ? (
                <ul className="history-list">
                  {demoHistory.entries.map((entry) => (
                    <li key={entry.id}>
                      <a href={`/demo-tickets/${entry.id}`}>{entry.ticketNumber}</a>
                      <span className={`status-pill status-${entry.status}`}>{STATUS_LABELS[entry.status] ?? entry.status}</span>
                      <span className="history-list__date">{formatDate(entry.demoDate)}</span>
                      <span className="history-list__issue">
                        {entry.demoServiceName} · SN {entry.serialNumber} · Invoice {entry.invoiceNumber}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No other demos for this serial number or invoice number.</p>
              )}
            </section>
          </div>

          <div className="ticket-grid__side">
            <section className="card" aria-labelledby="demo-status-heading">
              <h2 id="demo-status-heading">Status</h2>
              <form onSubmit={handleStatusChange} noValidate>
                <div>
                  <label htmlFor="toStatus">New status</label>
                  <select id="toStatus" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                        {s === ticket.status ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="comment">Comment</label>
                  <textarea
                    id="comment"
                    rows={2}
                    placeholder="Required for backward moves or Cancelled"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                {statusError && (
                  <p role="alert" aria-live="assertive" className="form-error">
                    {statusError}
                  </p>
                )}
                <button type="submit" disabled={savingStatus || !toStatus || toStatus === ticket.status}>
                  Update status
                </button>
              </form>
            </section>

            <section className="card" aria-labelledby="demo-technician-heading">
              <h2 id="demo-technician-heading">Technician</h2>
              {canManage && !locked ? (
                <form onSubmit={handleAssign} noValidate>
                  <SearchableSelect
                    id="technicianSelection"
                    label="Assigned technician"
                    placeholder="Unassigned"
                    options={technicians.map((t) => ({ id: t.id, label: t.name }))}
                    value={technicianSelection}
                    onChange={setTechnicianSelection}
                  />
                  {assignMessage && <p role={assignMessage.ok ? "status" : "alert"}>{assignMessage.text}</p>}
                  <button type="submit" disabled={assigning || technicianSelection === (ticket.assignedTechnicianId ?? "")}>
                    {ticket.assignedTechnicianId ? "Save assignment" : "Assign & notify"}
                  </button>
                </form>
              ) : (
                <p>{ticket.assignedTechnicianName ?? "Unassigned"}</p>
              )}
              {ticket.assignedTechnicianId && !ticket.assignedTechnicianHasPhone && canManage && (
                <p className="muted">{ticket.assignedTechnicianName} has no WhatsApp number on the Team page.</p>
              )}
              <div className="card__subsection">
                <h3>Ticket link</h3>
                <p className="short-link">
                  <a href={ticket.shortUrl}>{ticket.shortUrl}</a>
                  <button type="button" onClick={copyLink}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </p>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <section className="card" role="tabpanel" id="panel-activity" aria-labelledby="tab-activity">
          <h2 className="sr-only">Activity</h2>
          {activity.length === 0 ? (
            <p className="muted">No activity recorded yet.</p>
          ) : (
            <ol className="timeline">
              {[...activity].reverse().map((entry, i) => (
                <li key={i} className={`timeline__item timeline__item--${entry.source === "status" ? "status_history" : entry.source === "edit" ? "details_edit" : entry.source}`}>
                  <div className="timeline__text">{entry.description}</div>
                  <div className="timeline__meta">
                    {entry.actor ?? "System"} · {formatDateTime(entry.timestamp)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
