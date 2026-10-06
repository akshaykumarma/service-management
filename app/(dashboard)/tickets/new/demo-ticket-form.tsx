"use client";

import { useEffect, useState } from "react";
import { todayInBusinessTimeZone } from "@/lib/tickets/received-date";
import { formatDate } from "@/lib/format/date";
import { freshNewTicketUrl } from "@/lib/tickets/new-ticket-url";

interface Option {
  id: string;
  name: string;
}

interface DemoServiceOption {
  id: string;
  name: string;
  unitCost: number;
}

interface DemoHistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceName: string;
  demoDate: string;
  createdAt: string;
  sameCombination: boolean;
}

interface DemoHistory {
  entries: DemoHistoryEntry[];
  activeCount: number;
  warning: boolean;
}

const OTHER_MODEL = "__other__";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ERROR_MESSAGES: Record<string, string> = {
  received_date_in_future: "The received date can't be in the future.",
  invalid_received_date: "Enter a valid received date.",
  invalid_demo_date: "Enter a valid demo date.",
  demo_date_before_received: "The demo date can't be before the received date.",
  invalid_demo_service: "Choose an active demo service.",
  store_inactive: "That store is no longer active.",
  forbidden: "You can't create tickets for that store.",
};

const FIELD_NAMES: Record<string, string> = {
  storeId: "store",
  customerName: "customer name",
  customerPhone: "phone number",
  machineModel: "model number",
  serialNumber: "serial number",
  invoiceNumber: "invoice number",
  demoServiceId: "demo service",
  demoDate: "demo date",
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function HistoryPanel({ history }: { history: DemoHistory }) {
  if (history.entries.length === 0) return null;
  return (
    <section aria-labelledby="demo-history-heading" className="demo-history">
      <h2 id="demo-history-heading">Earlier demos for this serial / invoice number</h2>
      <ul>
        {history.entries.map((e) => (
          <li key={e.id}>
            <a href={`/demo-tickets/${e.id}`}>{e.ticketNumber}</a>
            <span className={`status-pill status-${e.status}`}>{STATUS_LABELS[e.status] ?? e.status}</span>
            <span className="muted">
              Demo {formatDate(e.demoDate)} · {e.demoServiceName} · Model {e.machineModel} · SN {e.serialNumber} · Invoice{" "}
              {e.invoiceNumber}
            </span>
            {e.sameCombination && <span className="demo-history__match">Same model + serial + invoice</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 008-demo-board US1: the Demo ticket form on New Ticket. Looks up earlier demos by
 * serial/invoice number as they are typed and warns before saving when this would be
 * the 3rd (or later) non-cancelled demo for the same model + serial + invoice number
 * combination — a warning, never a block (spec.md D4).
 */
export default function DemoTicketForm({
  stores,
  machineModelOptions,
}: {
  stores: Option[];
  machineModelOptions: Option[];
}) {
  const [demoServices, setDemoServices] = useState<DemoServiceOption[]>([]);
  const [storeId, setStoreId] = useState(stores.length === 1 ? stores[0].id : "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [machineModelChoice, setMachineModelChoice] = useState("");
  const [manualMachineModel, setManualMachineModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [demoServiceId, setDemoServiceId] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => todayInBusinessTimeZone());
  const [demoDate, setDemoDate] = useState("");
  const [history, setHistory] = useState<DemoHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; ticketNumber: string; history: DemoHistory } | null>(null);

  useEffect(() => {
    fetch("/api/catalogue/demo-services")
      .then((res) => (res.ok ? res.json() : { demoServices: [] }))
      .then((body) => setDemoServices(body.demoServices));
  }, []);

  useEffect(() => {
    if (!storeId && stores.length === 1) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const machineModel = machineModelChoice === OTHER_MODEL ? manualMachineModel.trim() : machineModelChoice;

  // Live history (serial or invoice) and repeat-demo check (model + serial + invoice),
  // debounced while typing.
  useEffect(() => {
    const serial = serialNumber.trim();
    const invoice = invoiceNumber.trim();
    if (!serial && !invoice) {
      setHistory(null);
      return;
    }
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (machineModel) params.set("machineModel", machineModel);
      if (serial) params.set("serialNumber", serial);
      if (invoice) params.set("invoiceNumber", invoice);
      const res = await fetch(`/api/demo-tickets/history?${params.toString()}`);
      if (res.ok) setHistory(await res.json());
    }, 400);
    return () => clearTimeout(timer);
  }, [machineModel, serialNumber, invoiceNumber]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/demo-tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId,
          customerName,
          customerPhone,
          machineModel,
          serialNumber,
          invoiceNumber,
          demoServiceId,
          receivedDate,
          demoDate,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setCreated({ id: body.ticket.id, ticketNumber: body.ticket.ticketNumber, history: body.history });
        return;
      }
      setError(
        body.error.code === "missing_required_field"
          ? `Please fill in the ${FIELD_NAMES[body.error.field] ?? body.error.field}.`
          : (ERROR_MESSAGES[body.error.code] ?? "Could not create the demo ticket."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section aria-labelledby="demo-created-heading">
        <h2 id="demo-created-heading">Demo ticket created: {created.ticketNumber}</h2>
        {created.history.warning && (
          <p className="demo-warning" role="status">
            Note: this is the {ordinal(created.history.activeCount + 1)} demo for this model + serial number + invoice
            number combination.
          </p>
        )}
        <HistoryPanel history={created.history} />
        <p className="demo-created-links">
          <a href={`/demo-tickets/${created.id}`}>View demo ticket</a>
          <a href="/demo-board">Go to Demo Board</a>
          <a href={freshNewTicketUrl()}>+ Create another ticket</a>
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="demoStoreId" className="required">
          Store
        </label>
        <select id="demoStoreId" required value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Select a store</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="demoCustomerName" className="required">
          Customer name
        </label>
        <input id="demoCustomerName" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="demoCustomerPhone" className="required">
          Phone number
        </label>
        <input id="demoCustomerPhone" type="tel" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
      </div>
      <div>
        <label htmlFor="demoMachineModel" className="required">
          Model number
        </label>
        <select id="demoMachineModel" required value={machineModelChoice} onChange={(e) => setMachineModelChoice(e.target.value)}>
          <option value="">Select a model</option>
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
          <label htmlFor="demoManualMachineModel" className="required">
            Model number (not in the list)
          </label>
          <input
            id="demoManualMachineModel"
            required
            autoFocus
            value={manualMachineModel}
            onChange={(e) => setManualMachineModel(e.target.value)}
          />
        </div>
      )}
      <div>
        <label htmlFor="demoSerialNumber" className="required">
          Serial number
        </label>
        <input id="demoSerialNumber" required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
      </div>
      <div>
        <label htmlFor="demoInvoiceNumber" className="required">
          Invoice number
        </label>
        <input id="demoInvoiceNumber" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
      </div>

      {history?.warning && (
        <p className="demo-warning" role="alert">
          This will be the {ordinal(history.activeCount + 1)} demo for this model + serial number + invoice number
          combination. Check the earlier demos below before creating another.
        </p>
      )}
      {history && <HistoryPanel history={history} />}

      <div>
        <label htmlFor="demoServiceId" className="required">
          Demo service
        </label>
        <select id="demoServiceId" required value={demoServiceId} onChange={(e) => setDemoServiceId(e.target.value)}>
          <option value="">Select a demo service</option>
          {demoServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (₹{s.unitCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </option>
          ))}
        </select>
        {demoServices.length === 0 && (
          <small>No demo services yet — an Admin can add them under Catalogue → Demo services.</small>
        )}
      </div>
      <div>
        <label htmlFor="demoReceivedDate" className="required">
          Received date
        </label>
        <input
          id="demoReceivedDate"
          type="date"
          required
          max={todayInBusinessTimeZone()}
          value={receivedDate}
          onChange={(e) => setReceivedDate(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="demoDate" className="required">
          Demo date
        </label>
        <input id="demoDate" type="date" required min={receivedDate} value={demoDate} onChange={(e) => setDemoDate(e.target.value)} />
      </div>
      {error && (
        <p role="alert" aria-live="assertive" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {history?.warning ? "Create demo ticket anyway" : "Create demo ticket"}
      </button>
    </form>
  );
}
