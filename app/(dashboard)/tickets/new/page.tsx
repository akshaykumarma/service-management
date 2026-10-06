"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { freshNewTicketUrl } from "@/lib/tickets/new-ticket-url";
import { todayInBusinessTimeZone } from "@/lib/tickets/received-date";
import { formatDate } from "@/lib/format/date";
import DemoTicketForm from "./demo-ticket-form";

interface Store {
  id: string;
  name: string;
}

interface MachineModelOption {
  id: string;
  name: string;
}

interface HistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  machineModel: string;
  issueDescription: string;
  createdAt: string;
}

// Sentinel <select> value for "the model isn't in the list — let me type it".
const OTHER_MODEL = "__other__";

const CREATE_ERROR_MESSAGES: Record<string, string> = {
  received_date_in_future: "The received date can't be in the future.",
  invalid_received_date: "Enter a valid received date.",
  store_inactive: "That store is no longer active.",
};

interface CreatedTicket {
  id: string;
  ticketNumber: string;
}

/**
 * Keyed on the `n` search param (lib/tickets/new-ticket-url.ts): clicking "New ticket"
 * again — even while already here — starts a fresh, empty form.
 */
export default function NewTicketPage() {
  return (
    <Suspense>
      <FreshNewTicketForm />
    </Suspense>
  );
}

function FreshNewTicketForm() {
  const searchParams = useSearchParams();
  return <NewTicketForm key={searchParams.get("n") ?? "initial"} />;
}

function NewTicketForm() {
  // 008-demo-board: New Ticket creates either kind; Service keeps today's form exactly.
  const [ticketType, setTicketType] = useState<"service" | "demo">("service");
  const [stores, setStores] = useState<Store[]>([]);
  const [machineModelOptions, setMachineModelOptions] = useState<MachineModelOption[]>([]);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [history, setHistory] = useState<{ found: boolean; entries: HistoryEntry[] } | null>(null);
  const [storeId, setStoreId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAltPhone, setCustomerAltPhone] = useState("");
  const [machineModelChoice, setMachineModelChoice] = useState("");
  const [manualMachineModel, setManualMachineModel] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => todayInBusinessTimeZone());
  const [serialNumber, setSerialNumber] = useState("");
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
    fetch("/api/machine-models")
      .then((res) => res.json())
      .then((body) => setMachineModelOptions(body.machineModels));
  }, []);

  const machineModel = machineModelChoice === OTHER_MODEL ? manualMachineModel.trim() : machineModelChoice;

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
          serialNumber,
          issueDescription,
          estimatedPickupDate: estimatedPickupDate || null,
          receivedDate,
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
      if (body.error.code === "missing_required_field") {
        setError(`Please fill in: ${String(body.error.field).replace(/([A-Z])/g, " $1").toLowerCase()}.`);
      } else {
        setError(CREATE_ERROR_MESSAGES[body.error.code] ?? body.error.message ?? "Could not create ticket.");
      }
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
            <h2 id="history-heading">Prior service history for this machine</h2>
            <p>Earlier tickets with the same serial number and phone number:</p>
            <ul>
              {history.entries.map((entry) => (
                <li key={entry.id}>
                  <a href={`/tickets/${entry.id}`}>{entry.ticketNumber}</a> — {formatDate(entry.createdAt)} —{" "}
                  {entry.status.replace("_", " ")} — {entry.issueDescription}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p>No prior service history for this serial number and phone number.</p>
        )}
        <p>
          <a href={`/tickets/${created.id}`}>View full ticket</a>
        </p>
        <p>
          <a className="button-link" href={freshNewTicketUrl()}>
            + Create another ticket
          </a>
        </p>
      </main>
    );
  }

  const typeSwitch = (
    <fieldset className="ticket-type-switch">
      <legend>Ticket type</legend>
      <label htmlFor="ticketTypeService">
        <input
          id="ticketTypeService"
          type="radio"
          name="ticketType"
          checked={ticketType === "service"}
          onChange={() => setTicketType("service")}
        />
        Service ticket
      </label>
      <label htmlFor="ticketTypeDemo">
        <input
          id="ticketTypeDemo"
          type="radio"
          name="ticketType"
          checked={ticketType === "demo"}
          onChange={() => setTicketType("demo")}
        />
        Demo ticket
      </label>
    </fieldset>
  );

  if (ticketType === "demo") {
    return (
      <main>
        <h1>New ticket</h1>
        {typeSwitch}
        <DemoTicketForm stores={stores} machineModelOptions={machineModelOptions} />
      </main>
    );
  }

  return (
    <main>
      <h1>New ticket</h1>
      {typeSwitch}
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="storeId" className="required">
            Store
          </label>
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
          <label htmlFor="customerName" className="required">
            Customer name
          </label>
          <input
            id="customerName"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="customerPhone" className="required">
            Customer phone
          </label>
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
          <label htmlFor="machineModel" className="required">
            Machine model
          </label>
          {/* A saved model from the admin list, or "Other" to type one that isn't
              there — tickets.machine_model is free text, so either saves fine. */}
          <select
            id="machineModel"
            required
            value={machineModelChoice}
            onChange={(e) => setMachineModelChoice(e.target.value)}
          >
            <option value="">Select a machine model</option>
            {machineModelOptions.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
            <option value={OTHER_MODEL}>Other (type manually)</option>
          </select>
        </div>
        {machineModelChoice === OTHER_MODEL && (
          <div>
            <label htmlFor="manualMachineModel" className="required">
              Machine model (not in the list)
            </label>
            <input
              id="manualMachineModel"
              required
              autoFocus
              placeholder="e.g. Usha Janome Allure DLX"
              value={manualMachineModel}
              onChange={(e) => setManualMachineModel(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="serialNumber" className="required">
            Serial number
          </label>
          <input id="serialNumber" required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </div>
        <div>
          <label htmlFor="issueDescription" className="required">
            Issue description
          </label>
          <textarea
            id="issueDescription"
            required
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="receivedDate" className="required">
            Received date
          </label>
          <input
            id="receivedDate"
            type="date"
            required
            max={todayInBusinessTimeZone()}
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
          <small>Defaults to today. Pick an earlier date to log a machine received in the past.</small>
        </div>
        <div>
          <label htmlFor="estimatedPickupDate">Estimated delivery date (optional)</label>
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
