"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [primaryContact, setPrimaryContact] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [storesRes, usersRes] = await Promise.all([fetch("/api/admin/stores"), fetch("/api/auth/users")]);
    setStores((await storesRes.json()).stores);
    setUsers((await usersRes.json()).users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/stores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, address, primaryContact, whatsappNumber, taxRate: Number(taxRate) }),
    });
    if (res.ok) {
      setName("");
      setAddress("");
      setPrimaryContact("");
      setWhatsappNumber("");
      setTaxRate("");
      load();
    } else {
      const body = await res.json();
      setError(STORE_ERROR_MESSAGES[body.error.code] ?? "Could not create store.");
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

  return (
    <main>
      <h1>Stores</h1>

      <section aria-labelledby="create-store-heading">
        <h2 id="create-store-heading">Add a store</h2>
        <form onSubmit={handleCreate} noValidate>
          <div>
            <label htmlFor="storeName" className="required">
              Name
            </label>
            <input id="storeName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="storeAddress" className="required">
              Address
            </label>
            <input id="storeAddress" required value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label htmlFor="storePrimaryContact" className="required">
              Primary contact
            </label>
            <input id="storePrimaryContact" required value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} />
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
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
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
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <button type="submit">Add store</button>
        </form>
      </section>

      <section aria-labelledby="stores-list-heading">
        <h2 id="stores-list-heading">All stores</h2>
        {stores.map((store) => {
          const assignedAdmins = users.filter((u) => u.role === "admin" && u.storeIds.includes(store.id));
          return (
            <article key={store.id} aria-labelledby={`store-${store.id}-heading`}>
              <h3 id={`store-${store.id}-heading`}>
                {store.name} — {store.active ? "Active" : "Inactive"}
              </h3>
              <dl>
                <dt>Address</dt>
                <dd>{store.address}</dd>
                <dt>Primary contact</dt>
                <dd>{store.primaryContact}</dd>
                <dt>WhatsApp number</dt>
                <dd>{store.whatsappNumber ?? "—"}</dd>
                <dt>Tax rate</dt>
                <dd>{store.taxRate}%</dd>
              </dl>
              <button type="button" onClick={() => patchStore(store.id, { active: !store.active })}>
                {store.active ? "Deactivate" : "Activate"}
              </button>

              <div aria-labelledby={`store-${store.id}-admins-heading`}>
                <h4 id={`store-${store.id}-admins-heading`}>Assigned Admins</h4>
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
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
