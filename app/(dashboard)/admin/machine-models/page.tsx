"use client";

import { useCallback, useEffect, useState } from "react";

interface MachineModel {
  id: string;
  name: string;
  manufacturer: string;
  category: string | null;
  active: boolean;
}

export default function MachineModelsPage() {
  const [machineModels, setMachineModels] = useState<MachineModel[]>([]);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; failed: { row: number; reason: string }[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/machine-models");
    setMachineModels((await res.json()).machineModels);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/machine-models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, manufacturer, category: category || null }),
    });
    if (res.ok) {
      setName("");
      setManufacturer("");
      setCategory("");
      load();
    } else {
      setError((await res.json()).error.code);
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

  return (
    <main>
      <h1>Machine models</h1>

      <section aria-labelledby="machine-models-heading">
        <h2 id="machine-models-heading">Add a machine model</h2>
        <form onSubmit={handleCreate} noValidate>
          <div>
            <label htmlFor="name" className="required">
              Model name
            </label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="manufacturer" className="required">
              Manufacturer
            </label>
            <input id="manufacturer" required value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </div>
          <div>
            <label htmlFor="category">Category (optional)</label>
            <input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <button type="submit">Add model</button>
        </form>

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

        <table>
          <caption>Active machine models</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Manufacturer</th>
              <th scope="col">Category</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {machineModels.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.manufacturer}</td>
                <td>{m.category ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => deactivate(m.id)}>
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
