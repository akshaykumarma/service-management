"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/modal";
import DemoServicesSection from "./demo-services-section";

interface Part {
  id: string;
  name: string;
  sku: string | null;
  unitCost: number;
  category: string | null;
  active: boolean;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  unitCost: number;
  active: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_name: "An active item with this name already exists.",
  invalid_unit_cost: "Unit cost must be zero or a positive number.",
};

export default function CataloguePage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; failed: { row: number; reason: string }[] } | null>(null);

  const [partSearch, setPartSearch] = useState("");
  const [partCategoryFilter, setPartCategoryFilter] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");

  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [partFormName, setPartFormName] = useState("");
  const [partFormSku, setPartFormSku] = useState("");
  const [partFormUnitCost, setPartFormUnitCost] = useState("");
  const [partFormCategory, setPartFormCategory] = useState("");
  const [partFormError, setPartFormError] = useState<string | null>(null);
  const [partSubmitting, setPartSubmitting] = useState(false);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceFormName, setServiceFormName] = useState("");
  const [serviceFormDescription, setServiceFormDescription] = useState("");
  const [serviceFormUnitCost, setServiceFormUnitCost] = useState("");
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [serviceSubmitting, setServiceSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [partsRes, servicesRes] = await Promise.all([
      fetch("/api/catalogue/parts"),
      fetch("/api/catalogue/services"),
    ]);
    setParts((await partsRes.json()).parts);
    setServices((await servicesRes.json()).services);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreatePartModal() {
    setEditingPart(null);
    setPartFormName("");
    setPartFormSku("");
    setPartFormUnitCost("");
    setPartFormCategory("");
    setPartFormError(null);
    setPartModalOpen(true);
  }

  function openEditPartModal(part: Part) {
    setEditingPart(part);
    setPartFormName(part.name);
    setPartFormSku(part.sku ?? "");
    setPartFormUnitCost(String(part.unitCost));
    setPartFormCategory(part.category ?? "");
    setPartFormError(null);
    setPartModalOpen(true);
  }

  async function handlePartModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPartFormError(null);
    setPartSubmitting(true);
    const payload = {
      name: partFormName,
      sku: partFormSku || null,
      unitCost: Number(partFormUnitCost),
      category: partFormCategory || null,
    };
    const res = editingPart
      ? await fetch(`/api/catalogue/parts/${editingPart.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/catalogue/parts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
    setPartSubmitting(false);
    if (res.ok) {
      setPartModalOpen(false);
      load();
    } else {
      const body = await res.json();
      setPartFormError(ERROR_MESSAGES[body.error.code] ?? "Could not save part.");
    }
  }

  function openCreateServiceModal() {
    setEditingService(null);
    setServiceFormName("");
    setServiceFormDescription("");
    setServiceFormUnitCost("");
    setServiceFormError(null);
    setServiceModalOpen(true);
  }

  function openEditServiceModal(service: Service) {
    setEditingService(service);
    setServiceFormName(service.name);
    setServiceFormDescription(service.description ?? "");
    setServiceFormUnitCost(String(service.unitCost));
    setServiceFormError(null);
    setServiceModalOpen(true);
  }

  async function handleServiceModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServiceFormError(null);
    setServiceSubmitting(true);
    const payload = {
      name: serviceFormName,
      description: serviceFormDescription || null,
      unitCost: Number(serviceFormUnitCost),
    };
    const res = editingService
      ? await fetch(`/api/catalogue/services/${editingService.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/catalogue/services", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
    setServiceSubmitting(false);
    if (res.ok) {
      setServiceModalOpen(false);
      load();
    } else {
      const body = await res.json();
      setServiceFormError(ERROR_MESSAGES[body.error.code] ?? "Could not save service.");
    }
  }

  async function deactivatePart(id: string) {
    await fetch(`/api/catalogue/parts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    load();
  }

  async function deactivateService(id: string) {
    await fetch(`/api/catalogue/services/${id}`, {
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
    const res = await fetch("/api/catalogue/parts/import", { method: "POST", body: formData });
    setImportResult(await res.json());
    load();
    e.target.value = "";
  }

  const partCategories = Array.from(new Set(parts.map((p) => p.category).filter((c): c is string => !!c))).sort();
  const filteredParts = parts.filter((p) => {
    const q = partSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q);
    const matchesCategory = !partCategoryFilter || p.category === partCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredServices = services.filter((s) => {
    const q = serviceSearch.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q);
  });

  return (
    <main>
      <h1>Parts, services &amp; demo catalogue</h1>

      <section aria-labelledby="parts-heading">
        <div className="section-header">
          <h2 id="parts-heading">Parts</h2>
          <button type="button" onClick={openCreatePartModal}>
            + Add part
          </button>
        </div>

        <div>
          <label htmlFor="csvImport">Bulk import parts from CSV (columns: name,sku,unit_cost,category)</label>
          <input id="csvImport" type="file" accept=".csv" onChange={handleImport} />
          <a href="/samples/parts-sample.csv" download="parts-sample.csv">
            Download sample CSV
          </a>
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
            <label htmlFor="partSearch">Search parts</label>
            <input
              id="partSearch"
              placeholder="Name, SKU, or category"
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
            />
          </div>
          <div className="list-toolbar__field">
            <label htmlFor="partCategoryFilter">Filter by category</label>
            <select id="partCategoryFilter" value={partCategoryFilter} onChange={(e) => setPartCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {partCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredParts.length === 0 && <p className="list-toolbar__empty">No parts match your search.</p>}

        <div className="table-scroll">
          <table>
            <caption>Active parts</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">SKU</th>
                <th scope="col">Unit cost</th>
                <th scope="col">Category</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredParts.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.sku ?? "—"}</td>
                  <td>{p.unitCost.toFixed(2)}</td>
                  <td>{p.category ?? "—"}</td>
                  <td>
                    <div className="article-actions">
                      <button type="button" onClick={() => openEditPartModal(p)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => deactivatePart(p.id)}>
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

      <section aria-labelledby="services-heading">
        <div className="section-header">
          <h2 id="services-heading">Services</h2>
          <button type="button" onClick={openCreateServiceModal}>
            + Add service
          </button>
        </div>

        <div className="list-toolbar">
          <div className="list-toolbar__field">
            <label htmlFor="serviceSearch">Search services</label>
            <input
              id="serviceSearch"
              placeholder="Name or description"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredServices.length === 0 && <p className="list-toolbar__empty">No services match your search.</p>}

        <div className="table-scroll">
          <table>
            <caption>Active services</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Unit cost</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.description ?? "—"}</td>
                  <td>{s.unitCost.toFixed(2)}</td>
                  <td>
                    <div className="article-actions">
                      <button type="button" onClick={() => openEditServiceModal(s)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => deactivateService(s.id)}>
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

      <DemoServicesSection />

      <Modal
        open={partModalOpen}
        title={editingPart ? "Edit part" : "Add a part"}
        onClose={() => setPartModalOpen(false)}
      >
        <form onSubmit={handlePartModalSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="partName" className="required">
                Name
              </label>
              <input id="partName" required value={partFormName} onChange={(e) => setPartFormName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="partSku">SKU (optional)</label>
              <input id="partSku" value={partFormSku} onChange={(e) => setPartFormSku(e.target.value)} />
            </div>
            <div>
              <label htmlFor="partUnitCost" className="required">
                Unit cost
              </label>
              <input
                id="partUnitCost"
                type="number"
                step="0.01"
                min="0"
                required
                value={partFormUnitCost}
                onChange={(e) => setPartFormUnitCost(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="partCategory">Category (optional)</label>
              <input id="partCategory" value={partFormCategory} onChange={(e) => setPartFormCategory(e.target.value)} />
            </div>
            {partFormError && (
              <p role="alert" aria-live="assertive">
                {partFormError}
              </p>
            )}
          </div>
          <div className="modal-panel__footer">
            <button type="button" onClick={() => setPartModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={partSubmitting}>
              {editingPart ? "Save changes" : "Add part"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={serviceModalOpen}
        title={editingService ? "Edit service" : "Add a service"}
        onClose={() => setServiceModalOpen(false)}
      >
        <form onSubmit={handleServiceModalSubmit} noValidate>
          <div className="modal-panel__body">
            <div>
              <label htmlFor="serviceName" className="required">
                Name
              </label>
              <input
                id="serviceName"
                required
                value={serviceFormName}
                onChange={(e) => setServiceFormName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="serviceDescription">Description (optional)</label>
              <input
                id="serviceDescription"
                value={serviceFormDescription}
                onChange={(e) => setServiceFormDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="serviceUnitCost" className="required">
                Unit cost
              </label>
              <input
                id="serviceUnitCost"
                type="number"
                step="0.01"
                min="0"
                required
                value={serviceFormUnitCost}
                onChange={(e) => setServiceFormUnitCost(e.target.value)}
              />
            </div>
            {serviceFormError && (
              <p role="alert" aria-live="assertive">
                {serviceFormError}
              </p>
            )}
          </div>
          <div className="modal-panel__footer">
            <button type="button" onClick={() => setServiceModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={serviceSubmitting}>
              {editingService ? "Save changes" : "Add service"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
