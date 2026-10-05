"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format/date";
import SearchableSelect from "@/components/searchable-select";

interface StoreOption {
  id: string;
  name: string;
}

interface TechnicianOption {
  id: string;
  name: string;
}

interface TicketDetailRow {
  id: string;
  ticketNumber: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  status: string;
  createdAt: string;
  estimatedPickupDate: string | null;
  technicianName: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface DemoTicketDetailRow {
  id: string;
  ticketNumber: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceName: string;
  demoServicePrice: number;
  demoDate: string;
  status: string;
  createdAt: string;
  technicianName: string | null;
}

type ReportType = "service" | "demo";

// Post-008 product feedback: Reports covers demo tickets too, with each type's own
// statuses, columns, API and export.
const REPORT_TYPES: Record<ReportType, { statuses: string[]; api: string; exportType: string; noun: string }> = {
  service: {
    statuses: ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"],
    api: "/api/reports/tickets",
    exportType: "details",
    noun: "ticket",
  },
  demo: {
    statuses: ["new", "assigned", "in_progress", "completed", "cancelled"],
    api: "/api/reports/demo-tickets",
    exportType: "demo-details",
    noun: "demo ticket",
  },
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([]);

  const [reportType, setReportType] = useState<ReportType>("service");
  const [tableStoreId, setTableStoreId] = useState("");
  const [tableDateFrom, setTableDateFrom] = useState("");
  // Defaults to today (per product feedback) — an unselected end date means "up to now",
  // not an error the user has to fix.
  const [tableDateTo, setTableDateTo] = useState(todayIsoDate());
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [tableCustomerName, setTableCustomerName] = useState("");
  const [tableCustomerPhone, setTableCustomerPhone] = useState("");
  const [tableMachineModel, setTableMachineModel] = useState("");
  const [tableTicketId, setTableTicketId] = useState("");
  const [tableTechnicianId, setTableTechnicianId] = useState("");
  const [tableSerialNumber, setTableSerialNumber] = useState("");
  const [tableInvoiceNumber, setTableInvoiceNumber] = useState("");
  const [ticketRows, setTicketRows] = useState<TicketDetailRow[] | null>(null);
  const [demoRows, setDemoRows] = useState<DemoTicketDetailRow[] | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  // The exact query behind the rows on screen, so an export always matches the table even
  // if the filter inputs were edited afterwards without re-applying.
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((body) => setStoreOptions(body.stores));
  }, []);

  useEffect(() => {
    fetch("/api/technicians")
      .then((res) => res.json())
      .then((body) => setTechnicianOptions(body.technicians));
  }, []);

  async function handleApplyTableFilters(e: React.FormEvent) {
    e.preventDefault();
    setTableError(null);
    setTicketRows(null);
    setDemoRows(null);
    setAppliedQuery(null);
    if (!tableDateFrom) {
      setTableError("Start date is required.");
      return;
    }
    const effectiveDateTo = tableDateTo || todayIsoDate();

    const params = new URLSearchParams();
    if (tableStoreId) params.set("storeId", tableStoreId);
    params.set("dateFrom", tableDateFrom);
    params.set("dateTo", effectiveDateTo);
    for (const status of statusFilter) params.append("status", status);
    if (tableCustomerName) params.set("customerName", tableCustomerName);
    if (tableCustomerPhone) params.set("customerPhone", tableCustomerPhone);
    if (tableMachineModel) params.set("machineModel", tableMachineModel);
    if (tableTicketId) params.set("ticketId", tableTicketId);
    if (tableTechnicianId) params.set("technicianId", tableTechnicianId);
    if (reportType === "demo") {
      if (tableSerialNumber) params.set("serialNumber", tableSerialNumber);
      if (tableInvoiceNumber) params.set("invoiceNumber", tableInvoiceNumber);
    }

    const res = await fetch(`${REPORT_TYPES[reportType].api}?${params.toString()}`);
    if (res.status === 403) {
      setTableError("Your role doesn't permit viewing reports.");
      return;
    }
    if (!res.ok) {
      setTableError("Could not load ticket details.");
      return;
    }
    const body = await res.json();
    if (reportType === "demo") setDemoRows(body.tickets);
    else setTicketRows(body.tickets);
    setAppliedQuery(params.toString());
  }

  function switchReportType(type: ReportType) {
    setReportType(type);
    setStatusFilter([]);
    setTicketRows(null);
    setDemoRows(null);
    setAppliedQuery(null);
    setTableError(null);
  }

  const shownCount = reportType === "demo" ? demoRows?.length : ticketRows?.length;
  const { noun, exportType } = REPORT_TYPES[reportType];

  function toggleStatus(status: string) {
    setStatusFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  return (
    <main>
      <h1>Reports</h1>

      <fieldset className="ticket-type-switch">
        <legend>Report on</legend>
        <label htmlFor="reportTypeService">
          <input
            id="reportTypeService"
            type="radio"
            name="reportType"
            checked={reportType === "service"}
            onChange={() => switchReportType("service")}
          />
          Service tickets
        </label>
        <label htmlFor="reportTypeDemo">
          <input
            id="reportTypeDemo"
            type="radio"
            name="reportType"
            checked={reportType === "demo"}
            onChange={() => switchReportType("demo")}
          />
          Demo tickets
        </label>
      </fieldset>

      <section aria-labelledby="ticket-table-heading">
        <h2 id="ticket-table-heading">{reportType === "demo" ? "Demo ticket details" : "Ticket details"}</h2>
        <form onSubmit={handleApplyTableFilters} noValidate>
          <div>
            <label htmlFor="tableStore">Filter by store</label>
            <select id="tableStore" value={tableStoreId} onChange={(e) => setTableStoreId(e.target.value)}>
              <option value="">All stores</option>
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tableDateFrom" className="required">
              Filter from date
            </label>
            <input
              id="tableDateFrom"
              type="date"
              required
              value={tableDateFrom}
              onChange={(e) => setTableDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tableDateTo">Filter to date (defaults to today)</label>
            <input id="tableDateTo" type="date" value={tableDateTo} onChange={(e) => setTableDateTo(e.target.value)} />
          </div>
          <fieldset>
            <legend>Status (all shown if none selected)</legend>
            {REPORT_TYPES[reportType].statuses.map((status) => (
              <label key={status} htmlFor={`tableStatus-${status}`}>
                <input
                  id={`tableStatus-${status}`}
                  type="checkbox"
                  checked={statusFilter.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="tableCustomerName">Customer name</label>
            <input
              id="tableCustomerName"
              value={tableCustomerName}
              onChange={(e) => setTableCustomerName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tableCustomerPhone">Customer mobile number</label>
            <input
              id="tableCustomerPhone"
              value={tableCustomerPhone}
              onChange={(e) => setTableCustomerPhone(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tableMachineModel">{reportType === "demo" ? "Model" : "Machine model"}</label>
            <input
              id="tableMachineModel"
              value={tableMachineModel}
              onChange={(e) => setTableMachineModel(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tableTicketId">Ticket number</label>
            <input id="tableTicketId" value={tableTicketId} onChange={(e) => setTableTicketId(e.target.value)} />
          </div>
          {reportType === "demo" && (
            <>
              <div>
                <label htmlFor="tableSerialNumber">Serial number</label>
                <input id="tableSerialNumber" value={tableSerialNumber} onChange={(e) => setTableSerialNumber(e.target.value)} />
              </div>
              <div>
                <label htmlFor="tableInvoiceNumber">Invoice number</label>
                <input id="tableInvoiceNumber" value={tableInvoiceNumber} onChange={(e) => setTableInvoiceNumber(e.target.value)} />
              </div>
            </>
          )}
          <SearchableSelect
            id="tableTechnicianId"
            label="Filter by technician"
            placeholder="All technicians"
            options={technicianOptions.map((t) => ({ id: t.id, label: t.name }))}
            value={tableTechnicianId}
            onChange={setTableTechnicianId}
          />
          {tableError && (
            <p role="alert" aria-live="assertive">
              {tableError}
            </p>
          )}
          <button type="submit">Apply filters</button>
        </form>

        {appliedQuery !== null && !!shownCount && (
          <div className="report-export" role="group" aria-label="Export this report">
            <span className="report-export__label">
              {shownCount} {noun}
              {shownCount === 1 ? "" : "s"} · Export:
            </span>
            {(
              [
                ["xlsx", "Excel"],
                ["csv", "CSV"],
                ["pdf", "PDF"],
              ] as const
            ).map(([format, label]) => (
              <a key={format} className="report-export__button" href={`/api/reports/export?type=${exportType}&format=${format}&${appliedQuery}`}>
                {label}
              </a>
            ))}
          </div>
        )}

        {reportType === "demo" && demoRows && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ticket #</th>
                  <th scope="col">Store</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Model</th>
                  <th scope="col">Serial number</th>
                  <th scope="col">Invoice number</th>
                  <th scope="col">Demo service</th>
                  <th scope="col">Demo date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                  <th scope="col">Technician</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {demoRows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a href={`/demo-tickets/${t.id}`}>{t.ticketNumber}</a>
                    </td>
                    <td>{t.storeName}</td>
                    <td>{t.customerName}</td>
                    <td>{t.customerPhone}</td>
                    <td>{t.machineModel}</td>
                    <td>{t.serialNumber}</td>
                    <td>{t.invoiceNumber}</td>
                    <td>{t.demoServiceName}</td>
                    <td>{formatDate(t.demoDate)}</td>
                    <td>{STATUS_LABELS[t.status] ?? t.status}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.technicianName ?? "—"}</td>
                    <td>{inr(t.demoServicePrice)}</td>
                  </tr>
                ))}
                {demoRows.length === 0 && (
                  <tr>
                    <td colSpan={13}>No demo tickets match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {reportType === "service" && ticketRows && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ticket #</th>
                  <th scope="col">Store</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Machine model</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Est. delivery date</th>
                  <th scope="col">Technician</th>
                  <th scope="col">Subtotal</th>
                  <th scope="col">Tax</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {ticketRows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a href={`/tickets/${t.id}`}>{t.ticketNumber}</a>
                    </td>
                    <td>{t.storeName}</td>
                    <td>{t.customerName}</td>
                    <td>{t.customerPhone}</td>
                    <td>{t.machineModel}</td>
                    <td>{STATUS_LABELS[t.status] ?? t.status}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.estimatedPickupDate ? formatDate(t.estimatedPickupDate) : "—"}</td>
                    <td>{t.technicianName ?? "—"}</td>
                    <td>{t.subtotal.toFixed(2)}</td>
                    <td>{t.taxAmount.toFixed(2)}</td>
                    <td>{t.total.toFixed(2)}</td>
                  </tr>
                ))}
                {ticketRows.length === 0 && (
                  <tr>
                    <td colSpan={12}>No tickets match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
