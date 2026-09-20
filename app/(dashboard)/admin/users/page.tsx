"use client";

import { useCallback, useEffect, useState } from "react";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "service_manager";
  active: boolean;
  storeIds: string[];
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "service_manager">("service_manager");
  const [storeIdsInput, setStoreIdsInput] = useState("");
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/auth/users");
    if (res.ok) {
      const body = await res.json();
      setUsers(body.users);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastTemporaryPassword(null);

    const storeIds = storeIdsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/auth/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, role, storeIds }),
    });

    if (res.ok) {
      const body = await res.json();
      setLastTemporaryPassword(body.user.temporaryPassword);
      setName("");
      setEmail("");
      setStoreIdsInput("");
      loadUsers();
    } else {
      const body = await res.json();
      setError(body.error.message ?? "Could not create user.");
    }
  }

  async function toggleActive(user: StaffUser) {
    await fetch(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    loadUsers();
  }

  return (
    <main>
      <h1>Staff accounts</h1>

      <section aria-labelledby="create-user-heading">
        <h2 id="create-user-heading">Add a staff account</h2>
        <form onSubmit={handleCreate} noValidate>
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="admin">Admin</option>
              <option value="service_manager">Store Service Manager</option>
            </select>
          </div>
          <div>
            <label htmlFor="storeIds">Store IDs (comma-separated)</label>
            <input
              id="storeIds"
              required
              value={storeIdsInput}
              onChange={(e) => setStoreIdsInput(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <button type="submit">Create account</button>
        </form>
        {lastTemporaryPassword && (
          <p role="status">
            Temporary password (relay this to the new hire, shown once): <code>{lastTemporaryPassword}</code>
          </p>
        )}
      </section>

      <section aria-labelledby="user-list-heading">
        <h2 id="user-list-heading">All staff accounts</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Stores</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? "Active" : "Deactivated"}</td>
                <td>{u.storeIds.join(", ") || "—"}</td>
                <td>
                  <button type="button" onClick={() => toggleActive(u)}>
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
