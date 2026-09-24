"use client";

import { useCallback, useEffect, useState } from "react";
import PasswordInput from "@/components/password-input";
import Modal from "@/components/modal";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: "super_admin" | "admin" | "service_manager" | "technician";
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
  invalid_username: "Username must be 3-32 characters: letters, digits, dots, underscores, or hyphens only.",
  username_already_registered: "That username is already taken.",
  store_assignment_required: "At least one store is required.",
  invalid_store_count: "A Service Manager or Technician must have exactly one store.",
  invalid_store_id: "One or more selected stores no longer exist.",
  email_already_registered: "That email is already registered.",
  not_found: "That account is outside what you can manage.",
};

export default function TeamPageClient({ callerRole }: { callerRole: "super_admin" | "admin" }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "service_manager" | "technician">("service_manager");
  const [formStoreIds, setFormStoreIds] = useState<string[]>([]);
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [resetMessages, setResetMessages] = useState<Record<string, { text: string; ok: boolean }>>({});

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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

  function openCreateModal() {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormUsername("");
    setFormRole("service_manager");
    setFormStoreIds([]);
    setFormPassword("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(user: StaffUser) {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormUsername(user.username ?? "");
    setFormRole(user.role === "super_admin" ? "admin" : user.role);
    setFormStoreIds(user.storeIds);
    setFormPassword("");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    if (editingUser) {
      const patch: Record<string, unknown> = { name: formName, storeIds: formStoreIds };
      if (editingUser.role !== "super_admin") patch.role = formRole;
      const res = await fetch(`/api/auth/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSubmitting(false);
      if (res.ok) {
        setModalOpen(false);
        loadUsers();
      } else {
        const body = await res.json();
        setFormError(ERROR_MESSAGES[body.error.code] ?? "Could not save changes.");
      }
      return;
    }

    const res = await fetch("/api/auth/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: formName,
        email: formEmail,
        username: formUsername || undefined,
        role: formRole,
        storeIds: formStoreIds,
        password: formPassword,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setModalOpen(false);
      loadUsers();
    } else {
      const body = await res.json();
      setFormError(ERROR_MESSAGES[body.error.code] ?? "Could not create account.");
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

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === "active" ? u.active : !u.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <main>
      <h1>Team</h1>

      <section aria-labelledby="user-list-heading">
        <div className="section-header">
          <h2 id="user-list-heading">
            {callerRole === "super_admin" ? "All staff accounts" : "Service Managers and Technicians in your stores"}
          </h2>
          <button type="button" onClick={openCreateModal}>
            Add staff
          </button>
        </div>

        <div className="list-toolbar">
          <div className="list-toolbar__field">
            <label htmlFor="teamSearch">Search team</label>
            <input
              id="teamSearch"
              placeholder="Name, email, or username"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="list-toolbar__field">
            <label htmlFor="teamRoleFilter">Filter by role</label>
            <select id="teamRoleFilter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="service_manager">Store Service Manager</option>
              <option value="technician">Technician</option>
            </select>
          </div>
          <div className="list-toolbar__field">
            <label htmlFor="teamStatusFilter">Filter by status</label>
            <select id="teamStatusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </div>
        </div>

        {filteredUsers.length === 0 && <p className="list-toolbar__empty">No staff accounts match your search.</p>}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Username</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Stores</th>
                <th scope="col">Active</th>
                <th scope="col">Reset password</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.username ?? "—"}</td>
                  <td>{u.role}</td>
                  <td>{u.active ? "Active" : "Deactivated"}</td>
                  <td>{storeNames(u.storeIds)}</td>
                  <td>
                    <div className="article-actions">
                      <button type="button" onClick={() => openEditModal(u)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => toggleActive(u)}>
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                  <td className="reset-password-cell">
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
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editingUser ? "Edit staff account" : "Add a staff account"}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleModalSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="name" className="required">
                Name
              </label>
              <input id="name" required value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="email" className={editingUser ? undefined : "required"}>
                Email{editingUser ? " (cannot be changed here)" : ""}
              </label>
              <input
                id="email"
                type="email"
                required={!editingUser}
                disabled={!!editingUser}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            {!editingUser && (
              <div>
                <label htmlFor="username">Username (optional — can log in with either)</label>
                <input id="username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
              </div>
            )}
            {editingUser?.username && (
              <div>
                <label htmlFor="usernameDisplay">Username (cannot be changed here)</label>
                <input id="usernameDisplay" disabled value={editingUser.username} />
              </div>
            )}
            <div>
              <label htmlFor="role">Role</label>
              {editingUser?.role === "super_admin" ? (
                <input disabled value="Super Admin (cannot be changed here)" />
              ) : (
                <select id="role" value={formRole} onChange={(e) => setFormRole(e.target.value as typeof formRole)}>
                  {callerRole === "super_admin" && <option value="admin">Admin</option>}
                  <option value="service_manager">Store Service Manager</option>
                  <option value="technician">Technician</option>
                </select>
              )}
            </div>
            {editingUser?.role !== "super_admin" && (
              <div>
                <label htmlFor="storeIds" className="required">
                  Store{formRole === "admin" ? "s" : ""} (
                  {formRole === "service_manager" || formRole === "technician"
                    ? "select exactly one"
                    : "ctrl/cmd-click to select more than one"}
                  )
                </label>
                <select
                  id="storeIds"
                  multiple
                  required
                  value={formStoreIds}
                  onChange={(e) => setFormStoreIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                >
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!editingUser && (
              <div>
                <label htmlFor="password" className="required">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  required
                  value={formPassword}
                  onChange={setFormPassword}
                />
                <small>{PASSWORD_HINT}</small>
              </div>
            )}
            {formError && (
              <p role="alert" aria-live="assertive">
                {formError}
              </p>
            )}
          </div>
          <div className="modal-panel__footer">
            <button type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {editingUser ? "Save changes" : "Create account"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
