"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/modal";

interface DemoService {
  id: string;
  name: string;
  description: string | null;
  unitCost: number;
  active: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_unit_cost: "Unit cost must be zero or a positive number.",
};

/**
 * 008-demo-board FR-008: the Catalogue's "Demo services" list — the same fields and
 * actions as the Services section above it, against /api/catalogue/demo-services. Its
 * active entries are the Demo service choices on a demo ticket.
 */
export default function DemoServicesSection() {
  const [demoServices, setDemoServices] = useState<DemoService[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DemoService | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnitCost, setFormUnitCost] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/catalogue/demo-services");
    if (res.ok) setDemoServices((await res.json()).demoServices);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openModal(service: DemoService | null) {
    setEditing(service);
    setFormName(service?.name ?? "");
    setFormDescription(service?.description ?? "");
    setFormUnitCost(service ? String(service.unitCost) : "");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!formName.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSubmitting(true);
    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      unitCost: Number(formUnitCost),
    };
    const res = editing
      ? await fetch(`/api/catalogue/demo-services/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/catalogue/demo-services", {
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
      setFormError(ERROR_MESSAGES[body.error.code] ?? "Could not save demo service.");
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/catalogue/demo-services/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    load();
  }

  const filtered = demoServices.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q);
  });

  return (
    <section aria-labelledby="demo-services-heading">
      <div className="section-header">
        <h2 id="demo-services-heading">Demo services</h2>
        <button type="button" onClick={() => openModal(null)}>
          + Add demo service
        </button>
      </div>

      <div className="list-toolbar">
        <div className="list-toolbar__field">
          <label htmlFor="demoServiceSearch">Search demo services</label>
          <input
            id="demoServiceSearch"
            placeholder="Name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="list-toolbar__empty">
          {demoServices.length === 0 ? "No demo services yet. Add one to use it on demo tickets." : "No demo services match your search."}
        </p>
      )}

      <div className="table-scroll">
        <table>
          <caption>Active demo services</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.description ?? "—"}</td>
                <td>{s.unitCost.toFixed(2)}</td>
                <td>
                  <div className="article-actions">
                    <button type="button" onClick={() => openModal(s)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deactivate(s.id)}>
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title={editing ? "Edit demo service" : "Add a demo service"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="demoServiceName" className="required">
                Name
              </label>
              <input id="demoServiceName" required value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="demoServiceDescription">Description (optional)</label>
              <input
                id="demoServiceDescription"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="demoServiceUnitCost" className="required">
                Unit cost
              </label>
              <input
                id="demoServiceUnitCost"
                type="number"
                step="0.01"
                min="0"
                required
                value={formUnitCost}
                onChange={(e) => setFormUnitCost(e.target.value)}
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
              {editing ? "Save changes" : "Add demo service"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
