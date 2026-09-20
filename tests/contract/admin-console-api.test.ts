import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as machineModelsGET, POST as machineModelsPOST } from "@/app/api/admin/machine-models/route";
import { PATCH as machineModelPATCH } from "@/app/api/admin/machine-models/[id]/route";
import { POST as machineModelsImportPOST } from "@/app/api/admin/machine-models/import/route";
import { GET as storesGET, POST as storesPOST } from "@/app/api/admin/stores/route";
import { PATCH as storePATCH } from "@/app/api/admin/stores/[id]/route";
import { POST as storeAdminsPOST } from "@/app/api/admin/stores/[id]/admins/route";
import { DELETE as storeAdminDELETE } from "@/app/api/admin/stores/[id]/admins/[userId]/route";

async function superAdminCookie() {
  const admin = await createUser({ role: "super_admin", password: "Correct123!" });
  return loginAs(admin.email, "Correct123!");
}

describe("POST/PATCH /api/admin/machine-models", () => {
  beforeEach(resetDb);

  it("201s and creates a machine model", async () => {
    const cookie = await superAdminCookie();
    const res = await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", {
        method: "POST",
        cookie,
        body: { name: "LG-FHM1207ZDL", manufacturer: "LG", category: "Washing Machine" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.machineModel.active).toBe(true);
  });

  it("409s duplicate_name for an existing active model", async () => {
    const cookie = await superAdminCookie();
    await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", { method: "POST", cookie, body: { name: "X", manufacturer: "Y" } }),
    );
    const res = await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", { method: "POST", cookie, body: { name: "X", manufacturer: "Z" } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("duplicate_name");
  });

  it("403s for a non-Super-Admin caller", async () => {
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");
    const res = await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", { method: "POST", cookie, body: { name: "X", manufacturer: "Y" } }),
    );
    expect(res.status).toBe(403);
  });

  it("200s a PATCH deactivating a model", async () => {
    const cookie = await superAdminCookie();
    const createRes = await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", { method: "POST", cookie, body: { name: "X", manufacturer: "Y" } }),
    );
    const { machineModel } = await createRes.json();

    const res = await machineModelPATCH(
      jsonRequest(`/api/admin/machine-models/${machineModel.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: machineModel.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).machineModel.active).toBe(false);

    const list = await machineModelsGET(jsonRequest("/api/admin/machine-models", { cookie }));
    const listBody = await list.json();
    expect(listBody.machineModels.some((m: { id: string }) => m.id === machineModel.id)).toBe(false);
  });

  it("200s a CSV import reporting a duplicate row", async () => {
    const cookie = await superAdminCookie();
    await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", { method: "POST", cookie, body: { name: "Existing", manufacturer: "Y" } }),
    );

    const csv = "name,manufacturer,category\nNew Model,LG,Washing Machine\nExisting,LG,Washing Machine\n";
    const formData = new FormData();
    formData.append("file", new Blob([csv], { type: "text/csv" }), "models.csv");

    const request = new NextRequest(new URL("/api/admin/machine-models/import", "http://localhost:3000"), {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000" },
      body: formData,
    });
    const res = await machineModelsImportPOST(request);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].row).toBe(3);
  });
});

describe("POST/PATCH /api/admin/stores", () => {
  beforeEach(resetDb);

  it("201s and creates a store as inactive by default", async () => {
    const cookie = await superAdminCookie();
    const res = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: {
          name: "Koramangala",
          address: "123 Main St",
          primaryContact: "Ravi",
          whatsappNumber: "+919876543210",
          taxRate: 18,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.store.active).toBe(false);
  });

  it("400s invalid_tax_rate outside [0, 100]", async () => {
    const cookie = await superAdminCookie();
    const res = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: "X", address: "A", primaryContact: "B", whatsappNumber: "+919876543210", taxRate: 150 },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_tax_rate");
  });

  it("activates once whatsappNumber validates, and 409s whatsapp_number_required_to_activate otherwise", async () => {
    const cookie = await superAdminCookie();
    const createRes = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: "X", address: "A", primaryContact: "B", whatsappNumber: "+919876543210", taxRate: 18 },
      }),
    );
    const { store } = await createRes.json();

    const activateRes = await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie, body: { active: true } }),
      { params: { id: store.id } },
    );
    expect(activateRes.status).toBe(200);
    expect((await activateRes.json()).store.active).toBe(true);

    const secondCreate = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: "Y", address: "A", primaryContact: "B", whatsappNumber: "not-a-number", taxRate: 18 },
      }),
    );
    const { store: secondStore } = await secondCreate.json();
    const failedActivate = await storePATCH(
      jsonRequest(`/api/admin/stores/${secondStore.id}`, { method: "PATCH", cookie, body: { active: true } }),
      { params: { id: secondStore.id } },
    );
    expect(failedActivate.status).toBe(409);
    expect((await failedActivate.json()).error.code).toBe("whatsapp_number_required_to_activate");
  });

  it("400s invalid_whatsapp_number for a malformed format", async () => {
    const cookie = await superAdminCookie();
    const store = await createStore();
    const res = await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie, body: { whatsappNumber: "abc" } }),
      { params: { id: store.id } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_whatsapp_number");
  });

  it("403s for a non-Super-Admin caller", async () => {
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");
    const res = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: "X", address: "A", primaryContact: "B", whatsappNumber: "+919876543210", taxRate: 18 },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("lists all stores including inactive ones", async () => {
    const cookie = await superAdminCookie();
    await createStore({ active: false });
    const res = await storesGET(jsonRequest("/api/admin/stores", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stores.some((s: { active: boolean }) => s.active === false)).toBe(true);
  });
});

describe("POST/DELETE /api/admin/stores/:id/admins", () => {
  beforeEach(resetDb);

  it("201s assigning an Admin and 404s for a non-Admin-role user", async () => {
    const cookie = await superAdminCookie();
    const store = await createStore();
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });

    const res = await storeAdminsPOST(
      jsonRequest(`/api/admin/stores/${store.id}/admins`, { method: "POST", cookie, body: { userId: admin.id } }),
      { params: { id: store.id } },
    );
    expect(res.status).toBe(201);

    const badRes = await storeAdminsPOST(
      jsonRequest(`/api/admin/stores/${store.id}/admins`, { method: "POST", cookie, body: { userId: sm.id } }),
      { params: { id: store.id } },
    );
    expect(badRes.status).toBe(404);
    expect((await badRes.json()).error.code).toBe("user_not_admin_role");
  });

  it("204s removing an assignment", async () => {
    const cookie = await superAdminCookie();
    const store = await createStore();
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    await storeAdminsPOST(
      jsonRequest(`/api/admin/stores/${store.id}/admins`, { method: "POST", cookie, body: { userId: admin.id } }),
      { params: { id: store.id } },
    );

    const res = await storeAdminDELETE(
      jsonRequest(`/api/admin/stores/${store.id}/admins/${admin.id}`, { method: "DELETE", cookie }),
      { params: { id: store.id, userId: admin.id } },
    );
    expect(res.status).toBe(204);
  });
});
