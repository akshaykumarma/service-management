"use client";

import { useCallback, useEffect, useState } from "react";

interface ActivityEntry {
  id: string;
  kind: "login" | "change";
  at: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  identifier: string | null;
  outcome: string | null;
  description: string;
  link: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

interface SignedInUser {
  userId: string;
  name: string;
  role: string;
  sessions: number;
  lastActiveAt: string;
}

interface Person {
  id: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  service_manager: "Service Manager",
  technician: "Technician",
};

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A short "Chrome on Android"-style label from a user-agent string. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function LoginActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [signedIn, setSignedIn] = useState<SignedInUser[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: { userId: string; kind: string; dateFrom: string; dateTo: string }) => {
    setError(null);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const res = await fetch(`/api/admin/activity?${params.toString()}`);
    if (!res.ok) {
      setError("Could not load activity. Check the filters and try again.");
      return;
    }
    const body = await res.json();
    setEntries(body.entries);
    setSignedIn(body.signedIn);
    setPeople(body.users);
  }, []);

  useEffect(() => {
    load({ userId: "", kind: "", dateFrom: "", dateTo: "" });
  }, [load]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError("The from date must be on or before the to date.");
      return;
    }
    load({ userId, kind, dateFrom, dateTo });
  }

  function handleClear() {
    setUserId("");
    setKind("");
    setDateFrom("");
    setDateTo("");
    load({ userId: "", kind: "", dateFrom: "", dateTo: "" });
  }

  return (
    <main className="activity-page">
      <h1>Login &amp; activity</h1>
      <p>Who signed in, from where, and what they changed. Visible to Super Admins only.</p>

      <section aria-labelledby="signed-in-heading" className="activity-signed-in">
        <h2 id="signed-in-heading">Signed in now ({signedIn.length})</h2>
        {signedIn.length === 0 ? (
          <p>Nobody has an active session.</p>
        ) : (
          <ul>
            {signedIn.map((u) => (
              <li key={u.userId}>
                <strong>
                  {u.name} · {ROLE_LABELS[u.role] ?? u.role}
                </strong>
                <span>
                  last active {dateTime.format(new Date(u.lastActiveAt))}
                  {u.sessions > 1 ? ` · ${u.sessions} devices` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading">Activity</h2>
        <form className="activity-filters" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="activityUser">User</label>
            <select id="activityUser" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({ROLE_LABELS[p.role] ?? p.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activityKind">Show</label>
            <select id="activityKind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Logins and changes</option>
              <option value="login">Logins only</option>
              <option value="change">Changes only</option>
            </select>
          </div>
          <div>
            <label htmlFor="activityFrom">From date</label>
            <input id="activityFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="activityTo">To date</label>
            <input id="activityTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <button type="submit">Apply filters</button>
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        </form>

        {entries === null ? (
          <p>Loading…</p>
        ) : (
          <div className="table-scroll">
            <table className="activity-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Activity</th>
                  <th scope="col">IP / device</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className={e.outcome && e.outcome !== "success" && e.outcome !== "logout" ? "activity-row--warn" : undefined}>
                    <td>{dateTime.format(new Date(e.at))}</td>
                    <td>{e.userName ?? <em title="No account matches what was typed">{e.identifier}</em>}</td>
                    <td>{e.userRole ? (ROLE_LABELS[e.userRole] ?? e.userRole) : "—"}</td>
                    <td>{e.link ? <a href={e.link}>{e.description}</a> : e.description}</td>
                    <td title={e.userAgent ?? undefined}>
                      {e.kind === "login" ? [e.ipAddress, deviceLabel(e.userAgent)].filter(Boolean).join(" · ") || "—" : "—"}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5}>No activity matches these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {entries && entries.length >= 200 && <p>Showing the latest 200 entries — narrow the filters to see older ones.</p>}
      </section>
    </main>
  );
}
