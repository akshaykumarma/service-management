"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format/date";

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

const ALL_STATUSES = ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([]);

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
  const [ticketRows, setTicketRows] = useState<TicketDetailRow[] | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

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

    const res = await fetch(`/api/reports/tickets?${params.toString()}`);
    if (res.status === 403) {
      setTableError("Your role doesn't permit viewing reports.");
      return;
    }
    if (!res.ok) {
      setTableError("Could not load ticket details.");
      return;
    }
    const body = await res.json();
    setTicketRows(body.tickets);
  }

  function toggleStatus(status: string) {
    setStatusFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  return (
    <main>
      <h1>Reports</h1>

      <section aria-labelledby="ticket-table-heading">
        <h2 id="ticket-table-heading">Ticket details</h2>
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
            {ALL_STATUSES.map((status) => (
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
            <label htmlFor="tableMachineModel">Machine model</label>
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
          <div>
            <label htmlFor="tableTechnicianId">Filter by technician</label>
            <select
              id="tableTechnicianId"
              value={tableTechnicianId}
              onChange={(e) => setTableTechnicianId(e.target.value)}
            >
              <option value="">All technicians</option>
              {technicianOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {tableError && (
            <p role="alert" aria-live="assertive">
              {tableError}
            </p>
          )}
          <button type="submit">Apply filters</button>
        </form>

        {ticketRows && (
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
