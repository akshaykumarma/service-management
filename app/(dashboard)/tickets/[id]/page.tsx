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

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [statusHistory, setStatusHistory] = useState<HistoryEntryRow[]>([]);
  const [notFound, setNotFound] = useState(false);

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
