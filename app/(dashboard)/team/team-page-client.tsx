"use client";

import { useCallback, useEffect, useState } from "react";
import PasswordInput from "@/components/password-input";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "service_manager";
  active: boolean;
  storeIds: string[];
}

interface StoreOption {
  id: string;
  name: string;
}

const PASSWORD_HINT =
  "At least 8 characters, including an uppercase letter, a lowercase letter, and a special character.";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_password: PASSWORD_HINT,
  invalid_email: "Enter a valid email address.",
  store_assignment_required: "At least one store is required.",
  invalid_store_count: "A Service Manager must have exactly one store.",
  invalid_store_id: "One or more selected stores no longer exist.",
  email_already_registered: "That email is already registered.",
  not_found: "That account is outside what you can manage.",
};

export default function TeamPageClient({ callerRole }: { callerRole: "super_admin" | "admin" }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "service_manager">("service_manager");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);

  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [resetMessages, setResetMessages] = useState<Record<string, { text: string; ok: boolean }>>({});

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

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((body) => setStoreOptions(body.stores));
  }, []);

  function storeNames(ids: string[]): string {
    return ids.map((id) => storeOptions.find((s) => s.id === id)?.name ?? id).join(", ") || "—";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreatedMessage(null);

    const res = await fetch("/api/auth/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, role, storeIds, password }),
    });

    if (res.ok) {
      setCreatedMessage(`${name}'s account was created.`);
      setName("");
      setEmail("");
      setStoreIds([]);
      setPassword("");
      loadUsers();
    } else {
      const body = await res.json();
      setCreateError(ERROR_MESSAGES[body.error.code] ?? "Could not create account.");
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

  async function handleResetPassword(userId: string) {
    setResetMessages((prev) => ({ ...prev, [userId]: undefined as unknown as { text: string; ok: boolean } }));
    const newPassword = resetPasswords[userId] ?? "";

    const res = await fetch(`/api/auth/users/${userId}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });

    if (res.ok) {
      setResetMessages((prev) => ({ ...prev, [userId]: { text: "Password reset.", ok: true } }));
      setResetPasswords((prev) => ({ ...prev, [userId]: "" }));
    } else {
      const body = await res.json();
      setResetMessages((prev) => ({
        ...prev,
        [userId]: { text: ERROR_MESSAGES[body.error.code] ?? "Could not reset password.", ok: false },
      }));
    }
  }

  return (
    <main>
      <h1>Team</h1>

      {callerRole === "super_admin" && (
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
              <label htmlFor="storeIds">
                Store{role === "admin" ? "s" : ""} (
                {role === "service_manager" ? "select exactly one" : "ctrl/cmd-click to select more than one"})
              </label>
              <select
                id="storeIds"
                multiple
                required
                value={storeIds}
                onChange={(e) => setStoreIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {storeOptions.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={setPassword}
              />
              <small>{PASSWORD_HINT}</small>
            </div>
            {createError && (
              <p role="alert" aria-live="assertive">
                {createError}
              </p>
            )}
            <button type="submit">Create account</button>
          </form>
          {createdMessage && <p role="status">{createdMessage}</p>}
        </section>
      )}

      <section aria-labelledby="user-list-heading">
        <h2 id="user-list-heading">
          {callerRole === "super_admin" ? "All staff accounts" : "Store Service Managers in your stores"}
        </h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Stores</th>
              {callerRole === "super_admin" && <th scope="col">Active</th>}
              <th scope="col">Reset password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? "Active" : "Deactivated"}</td>
                <td>{storeNames(u.storeIds)}</td>
                {callerRole === "super_admin" && (
                  <td>
                    <button type="button" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                )}
                <td>
                  <label htmlFor={`reset-password-${u.id}`}>New password</label>
                  <PasswordInput
                    id={`reset-password-${u.id}`}
                    autoComplete="new-password"
                    value={resetPasswords[u.id] ?? ""}
                    onChange={(value) => setResetPasswords((prev) => ({ ...prev, [u.id]: value }))}
                  />
                  <button
                    type="button"
                    onClick={() => handleResetPassword(u.id)}
                    disabled={!(resetPasswords[u.id] ?? "")}
                  >
                    Reset password
                  </button>
                  {resetMessages[u.id] && (
                    <p role={resetMessages[u.id].ok ? "status" : "alert"} aria-live="assertive">
                      {resetMessages[u.id].text}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
