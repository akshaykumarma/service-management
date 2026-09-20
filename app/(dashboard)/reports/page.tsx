"use client";

import { useEffect, useState } from "react";

interface StoreOption {
  id: string;
  name: string;
}

interface SummaryReport {
  totalTickets: number;
  byStatus: Record<string, number>;
  avgResolutionTimeHours: number;
  partsRevenue: number;
  servicesRevenue: number;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function ReportsPage() {
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((body) => setStoreOptions(body.stores));
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);
    if (!storeId || !dateFrom || !dateTo) {
      setError("Store, start date, and end date are all required.");
      return;
    }
    const res = await fetch(`/api/reports/summary?storeId=${storeId}&dateFrom=${dateFrom}&dateTo=${dateTo}`);
    if (res.status === 403) {
      setError("Your role doesn't permit viewing reports.");
      return;
    }
    if (!res.ok) {
      setError("Could not generate the report.");
      return;
    }
    setSummary(await res.json());
  }

  const summaryExportParams = `storeId=${storeId}&dateFrom=${dateFrom}&dateTo=${dateTo}&type=summary`;
  const listExportParams = `storeId=${storeId}&dateFrom=${dateFrom}&dateTo=${dateTo}`;

  return (
    <main>
      <h1>Reports</h1>

      <form onSubmit={handleGenerate} noValidate>
        <div>
          <label htmlFor="reportStore">Store</label>
          <select id="reportStore" required value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select a store</option>
            {storeOptions.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportDateFrom">From</label>
          <input id="reportDateFrom" type="date" required value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="reportDateTo">To</label>
          <input id="reportDateTo" type="date" required value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {error && (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <button type="submit">Generate report</button>
      </form>

      {summary && (
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading">Summary</h2>
          <dl>
            <dt>Total tickets (first Completed in this period)</dt>
            <dd>{summary.totalTickets}</dd>
            <dt>Average resolution time (hours)</dt>
            <dd>{summary.avgResolutionTimeHours.toFixed(1)}</dd>
            <dt>Parts revenue</dt>
            <dd>{summary.partsRevenue.toFixed(2)}</dd>
            <dt>Services revenue</dt>
            <dd>{summary.servicesRevenue.toFixed(2)}</dd>
          </dl>

          <h3>Current status breakdown</h3>
          <ul>
            {Object.entries(summary.byStatus).map(([status, count]) => (
              <li key={status}>
                {STATUS_LABELS[status] ?? status}: {count}
              </li>
            ))}
          </ul>

          <h3>Export</h3>
          <ul>
            <li>
              <a href={`/api/reports/export?format=csv&${summaryExportParams}`}>Summary as CSV</a>
            </li>
            <li>
              <a href={`/api/reports/export?format=pdf&${summaryExportParams}`}>Summary as PDF</a>
            </li>
            <li>
              <a href={`/api/reports/export?format=csv&${listExportParams}`}>Matching ticket list as CSV</a>
            </li>
            <li>
              <a href={`/api/reports/export?format=pdf&${listExportParams}`}>Matching ticket list as PDF</a>
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
