"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface TicketDetail {
  id: string;
  ticketNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  issueDescription: string;
  createdAt: string;
}

interface HistoryEntryRow {
  fromStatus: string | null;
  toStatus: string;
  actorId: string;
  actorName: string;
  comment: string | null;
  createdAt: string;
}

const ALL_STATUSES = ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"];

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [statusHistory, setStatusHistory] = useState<HistoryEntryRow[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [toStatus, setToStatus] = useState("");
  const [comment, setComment] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${params.id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const body = await res.json();
    setTicket(body.ticket);
    setStatusHistory(body.statusHistory);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, comment: comment || null }),
      });
      if (res.ok) {
        setToStatus("");
        setComment("");
        await load();
        return;
      }
      const body = await res.json();
      const messages: Record<string, string> = {
        comment_required: "A comment is required for this transition.",
        invalid_transition: "That status change isn't allowed from the current status.",
        role_not_permitted: "Your role doesn't permit this status change.",
      };
      setStatusError(messages[body.error.code] ?? "Could not update status.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <main>
        <p>No such ticket.</p>
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

  return (
    <main>
      <h1>{ticket.ticketNumber}</h1>
      <section aria-labelledby="intake-heading">
        <h2 id="intake-heading">Intake information</h2>
        <dl>
          <dt>Customer</dt>
          <dd>{ticket.customerName}</dd>
          <dt>Phone</dt>
          <dd>{ticket.customerPhone}</dd>
          <dt>Machine model</dt>
          <dd>{ticket.machineModel}</dd>
          <dt>Issue</dt>
          <dd>{ticket.issueDescription}</dd>
          <dt>Status</dt>
          <dd>{ticket.status}</dd>
        </dl>
      </section>

      <section aria-labelledby="status-change-heading">
        <h2 id="status-change-heading">Change status</h2>
        <form onSubmit={handleStatusChange} noValidate>
          <div>
            <label htmlFor="toStatus">New status</label>
            <select id="toStatus" required value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
              <option value="">Select a status</option>
              {ALL_STATUSES.filter((s) => s !== ticket.status).map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="comment">Comment (required for backward moves, On Hold, or Cancelled)</label>
            <textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          {statusError && (
            <p role="alert" aria-live="assertive">
              {statusError}
            </p>
          )}
          <button type="submit" disabled={submitting || !toStatus}>
            Update status
          </button>
        </form>
      </section>

      <section aria-labelledby="status-history-heading">
        <h2 id="status-history-heading">Status timeline</h2>
        <ul>
          {statusHistory.map((entry, i) => (
            <li key={i}>
              {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : `Created (${entry.toStatus})`} by{" "}
              {entry.actorName} at {new Date(entry.createdAt).toLocaleString()}
              {entry.comment ? ` — "${entry.comment}"` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
