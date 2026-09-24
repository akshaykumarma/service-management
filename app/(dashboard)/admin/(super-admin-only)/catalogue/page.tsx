"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function CataloguePage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [partName, setPartName] = useState("");
  const [partSku, setPartSku] = useState("");
  const [partUnitCost, setPartUnitCost] = useState("");
  const [partCategory, setPartCategory] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceUnitCost, setServiceUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; failed: { row: number; reason: string }[] } | null>(null);

  const [partSearch, setPartSearch] = useState("");
  const [partCategoryFilter, setPartCategoryFilter] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");

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

  async function handleCreatePart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/catalogue/parts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: partName,
        sku: partSku || null,
        unitCost: Number(partUnitCost),
        category: partCategory || null,
      }),
    });
    if (res.ok) {
      setPartName("");
      setPartSku("");
      setPartUnitCost("");
      setPartCategory("");
      load();
    } else {
      setError((await res.json()).error.code);
    }
  }

  async function handleCreateService(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/catalogue/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: serviceName, description: serviceDescription || null, unitCost: Number(serviceUnitCost) }),
    });
    if (res.ok) {
      setServiceName("");
      setServiceDescription("");
      setServiceUnitCost("");
      load();
    } else {
      setError((await res.json()).error.code);
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
      <h1>Parts &amp; services catalogue</h1>

      <section aria-labelledby="parts-heading">
        <h2 id="parts-heading">Parts</h2>
        <form onSubmit={handleCreatePart} noValidate>
          <div>
            <label htmlFor="partName" className="required">
              Name
            </label>
            <input id="partName" required value={partName} onChange={(e) => setPartName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="partSku">SKU (optional)</label>
            <input id="partSku" value={partSku} onChange={(e) => setPartSku(e.target.value)} />
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
              value={partUnitCost}
              onChange={(e) => setPartUnitCost(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="partCategory">Category (optional)</label>
            <input id="partCategory" value={partCategory} onChange={(e) => setPartCategory(e.target.value)} />
          </div>
          <button type="submit">Add part</button>
        </form>

        <div>
          <label htmlFor="csvImport">Bulk import parts from CSV (columns: name,sku,unit_cost,category)</label>
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

        <table>
          <caption>Active parts</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">SKU</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Category</th>
              <th scope="col">Action</th>
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
                  <button type="button" onClick={() => deactivatePart(p.id)}>
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="services-heading">
        <h2 id="services-heading">Services</h2>
        <form onSubmit={handleCreateService} noValidate>
          <div>
            <label htmlFor="serviceName" className="required">
              Name
            </label>
            <input id="serviceName" required value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="serviceDescription">Description (optional)</label>
            <input id="serviceDescription" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
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
              value={serviceUnitCost}
              onChange={(e) => setServiceUnitCost(e.target.value)}
            />
          </div>
          <button type="submit">Add service</button>
        </form>

        {error && (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        )}

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

        <table>
          <caption>Active services</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredServices.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.description ?? "—"}</td>
                <td>{s.unitCost.toFixed(2)}</td>
                <td>
                  <button type="button" onClick={() => deactivateService(s.id)}>
                    Deactivate
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
