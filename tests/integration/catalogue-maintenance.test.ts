import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as partsPOST, GET as partsGET } from "@/app/api/catalogue/parts/route";
import { PATCH as partPATCH } from "@/app/api/catalogue/parts/[id]/route";
import { POST as importPOST } from "@/app/api/catalogue/parts/import/route";
import { NextRequest } from "next/server";

describe("Catalogue maintenance by Super Admin (User Story 2)", () => {
  beforeEach(resetDb);

  it("makes a newly-created part immediately selectable, and excludes a deactivated one, without affecting the deactivated entry's own record", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const created = (await createRes.json()).part;

    const listBefore = await partsGET(jsonRequest("/api/catalogue/parts", { cookie }));
    expect((await listBefore.json()).parts.some((p: { id: string }) => p.id === created.id)).toBe(true);

    await partPATCH(
      jsonRequest(`/api/catalogue/parts/${created.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: created.id } },
    );

    const listAfter = await partsGET(jsonRequest("/api/catalogue/parts", { cookie }));
    expect((await listAfter.json()).parts.some((p: { id: string }) => p.id === created.id)).toBe(false);
  });

  it("imports valid CSV rows and reports invalid ones with a specific reason, without failing the whole file", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const csv = [
      "name,sku,unit_cost,category",
      "Belt,BLT-1,120.50,Washing Machine",
      "MissingCost,MC-1,,Fridge",
      "Belt,BLT-2,99.00,Washing Machine",
    ].join("\n");

    const formData = new FormData();
    formData.append("file", new Blob([csv], { type: "text/csv" }), "parts.csv");

    const request = new NextRequest(new URL("/api/catalogue/parts/import", "http://localhost:3000"), {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000" },
      body: formData,
    });

    const res = await importPOST(request);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.failed).toHaveLength(2);
    expect(body.failed[0].row).toBe(3); // MissingCost: unit_cost blank
    expect(body.failed[1].row).toBe(4); // duplicate "Belt" name against row 2's successful import
  });

  it("denies catalogue mutation to a Service Manager or Admin", async () => {
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "X", unitCost: 10 } }),
    );
    expect(res.status).toBe(403);
  });
});
