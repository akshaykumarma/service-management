import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as partsGET, POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { PATCH as partPATCH } from "@/app/api/catalogue/parts/[id]/route";
import { GET as servicesGET, POST as servicesPOST } from "@/app/api/catalogue/services/route";
import { PATCH as servicePATCH } from "@/app/api/catalogue/services/[id]/route";

describe("POST /api/catalogue/parts", () => {
  beforeEach(resetDb);

  it("201s and creates a part for a Super Admin", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", {
        method: "POST",
        cookie,
        body: { name: "Drain Pump", sku: "DP-100", unitCost: 850, category: "Washing Machine" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.part.name).toBe("Drain Pump");
  });

  it("400s with invalid_unit_cost for a negative cost", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "X", unitCost: -1 } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_unit_cost");
  });

  it("409s with duplicate_name for an existing active part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    await partsPOST(jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }));
    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 200 } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("duplicate_name");
  });

  it("403s for a non-Super-Admin caller", async () => {
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "X", unitCost: 10 } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/catalogue/parts", () => {
  beforeEach(resetDb);

  it("200s and lists active parts for any authenticated role", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    await partsPOST(jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }));

    const smCookie = await loginAs(sm.email, "Correct123!");
    const res = await partsGET(jsonRequest("/api/catalogue/parts", { cookie: smCookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parts.some((p: { name: string }) => p.name === "Belt")).toBe(true);
  });
});

describe("PATCH /api/catalogue/parts/:id", () => {
  beforeEach(resetDb);

  it("200s and deactivates a part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const created = (await createRes.json()).part;

    const res = await partPATCH(
      jsonRequest(`/api/catalogue/parts/${created.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: created.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).part.active).toBe(false);
  });

  it("404s for a non-existent part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partPATCH(
      jsonRequest("/api/catalogue/parts/00000000-0000-0000-0000-000000000000", {
        method: "PATCH",
        cookie,
        body: { active: false },
      }),
      { params: { id: "00000000-0000-0000-0000-000000000000" } },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/catalogue/services and GET/PATCH", () => {
  beforeEach(resetDb);

  it("creates, lists, and deactivates a service", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await servicesPOST(
      jsonRequest("/api/catalogue/services", {
        method: "POST",
        cookie,
        body: { name: "Diagnostic", description: "General diagnostic", unitCost: 200 },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).service;

    const listRes = await servicesGET(jsonRequest("/api/catalogue/services", { cookie }));
    const listBody = await listRes.json();
    expect(listBody.services.some((s: { id: string }) => s.id === created.id)).toBe(true);

    const patchRes = await servicePATCH(
      jsonRequest(`/api/catalogue/services/${created.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: created.id } },
    );
    expect(patchRes.status).toBe(200);
  });
});
