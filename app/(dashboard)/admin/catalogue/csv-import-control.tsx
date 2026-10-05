"use client";

import { useState } from "react";

interface ImportResult {
  imported: number;
  failed: { row: number; reason: string }[];
}

/**
 * The Parts section's bulk CSV import, as a reusable control for the Services and Demo
 * services sections: file picker, sample CSV download, and the imported/failed summary.
 */
export default function CsvImportControl({
  id,
  label,
  endpoint,
  sampleHref,
  onImported,
}: {
  id: string;
  label: string;
  endpoint: string;
  sampleHref: string;
  onImported: () => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: formData });
    if (res.ok) {
      setResult(await res.json());
      onImported();
    } else {
      setError("Could not import this file. Check it is a CSV with the columns shown.");
    }
    e.target.value = "";
  }

  return (
    <>
      <div>
        <label htmlFor={id}>{label}</label>
        <input id={id} type="file" accept=".csv" onChange={handleImport} />
        <a href={sampleHref} download={sampleHref.split("/").pop()}>
          Download sample CSV
        </a>
      </div>
      {result && (
        <p role="status">
          Imported {result.imported}.{" "}
          {result.failed.length > 0 &&
            `${result.failed.length} row(s) failed: ${result.failed.map((f) => `row ${f.row} (${f.reason})`).join(", ")}`}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
