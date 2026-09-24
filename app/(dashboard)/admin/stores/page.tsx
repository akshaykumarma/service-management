"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/modal";

interface Store {
  id: string;
  name: string;
  address: string | null;
  primaryContact: string | null;
  whatsappNumber: string | null;
  taxRate: number;
  active: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  storeIds: string[];
}

const STORE_ERROR_MESSAGES: Record<string, string> = {
  missing_required_field: "All fields are required.",
  invalid_tax_rate: "Tax rate must be between 0 and 100.",
  invalid_whatsapp_number: "WhatsApp number must be in international format, e.g. +919876543210.",
  whatsapp_number_required_to_activate: "A valid WhatsApp number is required before this store can be activated.",
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPrimaryContact, setFormPrimaryContact] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formTaxRate, setFormTaxRate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [storesRes, usersRes] = await Promise.all([fetch("/api/admin/stores"), fetch("/api/auth/users")]);
    setStores((await storesRes.json()).stores);
    setUsers((await usersRes.json()).users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreateModal() {
    setEditingStore(null);
    setFormName("");
    setFormAddress("");
    setFormPrimaryContact("");
    setFormWhatsapp("");
    setFormTaxRate("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(store: Store) {
    setEditingStore(store);
    setFormName(store.name);
    setFormAddress(store.address ?? "");
    setFormPrimaryContact(store.primaryContact ?? "");
    setFormWhatsapp(store.whatsappNumber ?? "");
    setFormTaxRate(String(store.taxRate ?? ""));
    setFormError(null);
    setModalOpen(true);
  }

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const payload = {
      name: formName,
      address: formAddress,
      primaryContact: formPrimaryContact,
      whatsappNumber: formWhatsapp,
      taxRate: Number(formTaxRate),
    };
    const res = editingStore
      ? await fetch(`/api/admin/stores/${editingStore.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/stores", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSubmitting(false);
    if (res.ok) {
      setModalOpen(false);
      load();
    } else {
      const body = await res.json();
      setFormError(STORE_ERROR_MESSAGES[body.error.code] ?? "Could not save store.");
    }
  }

  async function patchStore(id: string, patch: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/stores/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      load();
    } else {
      const body = await res.json();
      setError(STORE_ERROR_MESSAGES[body.error.code] ?? "Could not update store.");
    }
  }

  async function assignAdmin(storeId: string) {
    const userId = selectedAdmin[storeId];
    if (!userId) return;
    await fetch(`/api/admin/stores/${storeId}/admins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    load();
  }

  async function removeAdmin(storeId: string, userId: string) {
    await fetch(`/api/admin/stores/${storeId}/admins/${userId}`, { method: "DELETE" });
    load();
  }

  const admins = users.filter((u) => u.role === "admin");

  const filteredStores = stores.filter((store) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      store.name.toLowerCase().includes(q) ||
      (store.address ?? "").toLowerCase().includes(q) ||
      (store.primaryContact ?? "").toLowerCase().includes(q);
    const matchesStatus = !statusFilter || (statusFilter === "active" ? store.active : !store.active);
    return matchesSearch && matchesStatus;
  });

  return (
    <main>
      <h1>Stores</h1>

      <section aria-labelledby="stores-list-heading">
        <div className="section-header">
          <h2 id="stores-list-heading">All stores</h2>
          <button type="button" onClick={openCreateModal}>
            Add store
          </button>
        </div>

        {error && (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        )}

        <div className="list-toolbar">
          <div className="list-toolbar__field">
            <label htmlFor="storeSearch">Search stores</label>
            <input
              id="storeSearch"
              placeholder="Name, address, or contact"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="list-toolbar__field">
            <label htmlFor="storeStatusFilter">Filter by status</label>
            <select id="storeStatusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {filteredStores.length === 0 && <p className="list-toolbar__empty">No stores match your search.</p>}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Address</th>
                <th scope="col">Primary contact</th>
                <th scope="col">WhatsApp number</th>
                <th scope="col">Tax rate</th>
                <th scope="col">Status</th>
                <th scope="col">Assigned Admins</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((store) => {
                const assignedAdmins = users.filter((u) => u.role === "admin" && u.storeIds.includes(store.id));
                return (
                  <tr key={store.id} aria-label={store.name}>
                    <td>{store.name}</td>
                    <td>{store.address}</td>
                    <td>{store.primaryContact}</td>
                    <td>{store.whatsappNumber ?? "—"}</td>
                    <td>{store.taxRate}%</td>
                    <td>{store.active ? "Active" : "Inactive"}</td>
                    <td className="store-admins-cell">
                      <ul>
                        {assignedAdmins.map((admin) => (
                          <li key={admin.id}>
                            {admin.name}{" "}
                            <button type="button" onClick={() => removeAdmin(store.id, admin.id)}>
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label htmlFor={`assign-admin-${store.id}`}>Assign an Admin</label>
                      <select
                        id={`assign-admin-${store.id}`}
                        value={selectedAdmin[store.id] ?? ""}
                        onChange={(e) => setSelectedAdmin((prev) => ({ ...prev, [store.id]: e.target.value }))}
                      >
                        <option value="">Select an Admin</option>
                        {admins.map((admin) => (
                          <option key={admin.id} value={admin.id}>
                            {admin.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => assignAdmin(store.id)} disabled={!selectedAdmin[store.id]}>
                        Assign
                      </button>
                    </td>
                    <td>
                      <div className="article-actions">
                        <button type="button" onClick={() => openEditModal(store)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => patchStore(store.id, { active: !store.active })}>
                          {store.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modalOpen} title={editingStore ? "Edit store" : "Add a store"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleModalSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="storeName" className="required">
                Name
              </label>
              <input id="storeName" required value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="storeAddress" className="required">
                Address
              </label>
              <input id="storeAddress" required value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div>
              <label htmlFor="storePrimaryContact" className="required">
                Primary contact
              </label>
              <input
                id="storePrimaryContact"
                required
                value={formPrimaryContact}
                onChange={(e) => setFormPrimaryContact(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="storeWhatsapp" className="required">
                WhatsApp number
              </label>
              <input
                id="storeWhatsapp"
                required
                placeholder="+919876543210"
                pattern="\+[1-9]\d{7,14}"
                title="International format starting with +, e.g. +919876543210 — no spaces or dashes."
                value={formWhatsapp}
                onChange={(e) => setFormWhatsapp(e.target.value)}
              />
              <small>International format, e.g. +919876543210 — country code with +, no spaces or dashes.</small>
            </div>
            <div>
              <label htmlFor="storeTaxRate">Tax rate (%) (optional — tax is now set per-ticket)</label>
              <input
                id="storeTaxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formTaxRate}
                onChange={(e) => setFormTaxRate(e.target.value)}
              />
            </div>
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
              {editingStore ? "Save changes" : "Create store"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
