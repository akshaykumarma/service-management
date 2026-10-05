import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createDemoService, createStore, createUser } from "../helpers/factories";
import { loginAs } from "../helpers/http";
import { POST as servicesImportPOST } from "@/app/api/catalogue/services/import/route";
import { POST as demoImportPOST } from "@/app/api/catalogue/demo-services/import/route";
import { db } from "@/lib/db/client";
import { demoServices, services } from "@/lib/db/schema";

function uploadRequest(path: string, csv: string, cookie: string) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "import.csv");
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    headers: { cookie, origin: "http://localhost:3000" },
    body: form,
  });
}

const CSV = [
  "name,description,unit_cost",
  "Oiling,,120",
  ",No name,50",
  "Bad price,,abc",
  "Oiling,Duplicate in file,130",
  "Existing,,10",
  "Timing reset,Hook timing,450.5",
].join("\n");

describe("bulk CSV import for Services and Demo services (Catalogue)", () => {
  beforeEach(resetDb);

  async function adminCookie() {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    return { store, cookie: await loginAs(admin.email, "Correct123!") };
  }

  it("imports good service rows and reports each bad one with a reason", async () => {
    const { cookie } = await adminCookie();
    await db.insert(services).values({ name: "Existing", unitCost: "1.00" });

    const res = await servicesImportPOST(uploadRequest("/api/catalogue/services/import", CSV, cookie));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.imported).toBe(2);
    expect(result.failed.map((f: { row: number }) => f.row)).toEqual([3, 4, 5, 6]);
    expect(result.failed[2].reason).toContain("Duplicate name in this file");
    expect(result.failed[3].reason).toContain('A service named "Existing" already exists');

    const names = (await db.select().from(services)).map((s) => `${s.name}:${s.unitCost}`).sort();
    expect(names).toEqual(["Existing:1.00", "Oiling:120.00", "Timing reset:450.50"]);
  });

  it("imports demo services into the Demo services list only", async () => {
    const { cookie } = await adminCookie();
    await createDemoService({ name: "Existing" });

    const result = await (await demoImportPOST(uploadRequest("/api/catalogue/demo-services/import", CSV, cookie))).json();
    expect(result.imported).toBe(2);
    expect(result.failed[3].reason).toContain('A demo service named "Existing" already exists');
    expect((await db.select().from(demoServices)).length).toBe(3);
    expect(await db.select().from(services)).toEqual([]);
  });

  it("refuses a Service Manager", async () => {
    const { store } = await adminCookie();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const res = await servicesImportPOST(uploadRequest("/api/catalogue/services/import", CSV, await loginAs(sm.email, "Correct123!")));
    expect(res.status).toBe(403);
  });
});
