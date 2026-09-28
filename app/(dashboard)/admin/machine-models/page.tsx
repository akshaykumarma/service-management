"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/modal";

interface MachineModel {
  id: string;
  name: string;
  manufacturer: string;
  category: string | null;
  active: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_name: "An active model with this name already exists.",
};

export default function MachineModelsPage() {
  const [machineModels, setMachineModels] = useState<MachineModel[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; failed: { row: number; reason: string }[] } | null>(null);

  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<MachineModel | null>(null);
  const [formName, setFormName] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/machine-models");
    setMachineModels((await res.json()).machineModels);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreateModal() {
    setEditingModel(null);
    setFormName("");
    setFormManufacturer("");
    setFormCategory("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(model: MachineModel) {
    setEditingModel(model);
    setFormName(model.name);
    setFormManufacturer(model.manufacturer);
    setFormCategory(model.category ?? "");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const payload = { name: formName, manufacturer: formManufacturer, category: formCategory || null };
    const res = editingModel
      ? await fetch(`/api/admin/machine-models/${editingModel.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/machine-models", {
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
      setFormError(ERROR_MESSAGES[body.error.code] ?? "Could not save machine model.");
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/admin/machine-models/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/machine-models/import", { method: "POST", body: formData });
    setImportResult(await res.json());
    load();
    e.target.value = "";
  }

  const manufacturers = Array.from(new Set(machineModels.map((m) => m.manufacturer))).sort();
  const filteredMachineModels = machineModels.filter((m) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || m.name.toLowerCase().includes(q) || (m.category ?? "").toLowerCase().includes(q);
    const matchesManufacturer = !manufacturerFilter || m.manufacturer === manufacturerFilter;
    return matchesSearch && matchesManufacturer;
  });

  return (
    <main>
      <div className="section-header">
        <h1>Machine models</h1>
        <button type="button" onClick={openCreateModal}>
          + Add model
        </button>
      </div>

      <section aria-labelledby="machine-models-heading">
        <h2 id="machine-models-heading">Active machine models</h2>

        <div>
          <label htmlFor="csvImport">Bulk import from CSV (columns: name,manufacturer,category)</label>
          <input id="csvImport" type="file" accept=".csv" onChange={handleImport} />
        </div>
        {importResult && (
          <p role="status">
            Imported {importResult.imported}.{" "}
            {importResult.failed.length > 0 &&
              `${importResult.failed.length} row(s) failed: ${importResult.failed
                .map((f) => `row ${f.row} (${f.reason})`)
                .join(", ")}`}
          </p>
        )}

        <div className="list-toolbar">
          <div className="list-toolbar__field">
            <label htmlFor="machineModelSearch">Search machine models</label>
            <input
              id="machineModelSearch"
              placeholder="Name or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="list-toolbar__field">
            <label htmlFor="machineModelManufacturerFilter">Filter by manufacturer</label>
            <select
              id="machineModelManufacturerFilter"
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
            >
              <option value="">All manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredMachineModels.length === 0 && (
          <p className="list-toolbar__empty">No machine models match your search.</p>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Manufacturer</th>
                <th scope="col">Category</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMachineModels.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.manufacturer}</td>
                  <td>{m.category ?? "—"}</td>
                  <td>
                    <div className="article-actions">
                      <button type="button" onClick={() => openEditModal(m)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => deactivate(m.id)}>
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editingModel ? "Edit machine model" : "Add a machine model"}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleModalSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="name" className="required">
                Model name
              </label>
              <input id="name" required value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="manufacturer" className="required">
                Manufacturer
              </label>
              <input
                id="manufacturer"
                required
                value={formManufacturer}
                onChange={(e) => setFormManufacturer(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="category">Category (optional)</label>
              <input id="category" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
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
              {editingModel ? "Save changes" : "Add model"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
