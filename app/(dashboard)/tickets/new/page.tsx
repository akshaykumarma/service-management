"use client";

import { useEffect, useState } from "react";

interface Store {
  id: string;
  name: string;
}

interface HistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
}

interface CreatedTicket {
  id: string;
  ticketNumber: string;
}

export default function NewTicketPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [history, setHistory] = useState<{ found: boolean; entries: HistoryEntry[] } | null>(null);
  const [storeId, setStoreId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAltPhone, setCustomerAltPhone] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [estimatedPickupDate, setEstimatedPickupDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((body) => {
        setStores(body.stores);
        if (body.stores.length === 1) setStoreId(body.stores[0].id);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId,
          customerName,
          customerPhone,
          customerAltPhone: customerAltPhone || null,
          machineModel,
          issueDescription,
          estimatedPickupDate: estimatedPickupDate || null,
        }),
      });

      if (res.ok) {
        const body = await res.json();
        // Shown here, immediately, per contracts/tickets-api.md's inline history
        // result — not deferred to a follow-up screen or a separate search step.
        setCreated(body.ticket);
        setHistory(body.history);
        return;
      }

      const body = await res.json();
      setError(body.error.message ?? body.error.code ?? "Could not create ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created && history) {
    return (
      <main>
        <h1>Ticket created: {created.ticketNumber}</h1>
        {history.found ? (
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Prior service history for this model</h2>
            <ul>
              {history.entries.map((entry) => (
                <li key={entry.id}>
                  {entry.ticketNumber} — {entry.status}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p>No prior service history for this machine model.</p>
        )}
        <p>
          <a href={`/tickets/${created.id}`}>View full ticket</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>New ticket</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="storeId">Store</label>
          <select id="storeId" required value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select a store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="customerName">Customer name</label>
          <input
            id="customerName"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="customerPhone">Customer phone</label>
          <input
            id="customerPhone"
            required
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="customerAltPhone">Alternate phone (optional)</label>
          <input
            id="customerAltPhone"
            value={customerAltPhone}
            onChange={(e) => setCustomerAltPhone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="machineModel">Machine model</label>
          <input id="machineModel" required value={machineModel} onChange={(e) => setMachineModel(e.target.value)} />
        </div>
        <div>
          <label htmlFor="issueDescription">Issue description</label>
          <textarea
            id="issueDescription"
            required
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="estimatedPickupDate">Estimated pickup date (optional)</label>
          <input
            id="estimatedPickupDate"
            type="date"
            value={estimatedPickupDate}
            onChange={(e) => setEstimatedPickupDate(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          Create ticket
        </button>
      </form>
    </main>
  );
}
