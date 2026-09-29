import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { importMachineModelsCsv } from "@/lib/admin/machine-models-csv-import";
import { importPartsCsv } from "@/lib/catalogue/csv-import";

// The downloadable samples on the Machine Models / Catalogue pages must always be a file
// the matching importer accepts in full — otherwise they'd teach users a broken format.
function readSample(name: string): string {
  return readFileSync(path.join(process.cwd(), "public", "samples", name), "utf8");
}

describe("downloadable sample CSVs", () => {
  beforeEach(resetDb);

  it("machine-models-sample.csv imports every row", async () => {
    const result = await importMachineModelsCsv(readSample("machine-models-sample.csv"));
    expect(result.failed).toEqual([]);
    expect(result.imported).toBe(5);
  });

  it("parts-sample.csv imports every row", async () => {
    const result = await importPartsCsv(readSample("parts-sample.csv"));
    expect(result.failed).toEqual([]);
    expect(result.imported).toBe(5);
  });
});
