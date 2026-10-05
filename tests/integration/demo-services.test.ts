import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as listGET, POST as createPOST } from "@/app/api/catalogue/demo-services/route";
import { PATCH as updatePATCH } from "@/app/api/catalogue/demo-services/[id]/route";

describe("Catalogue: Demo services (008 FR-008)", () => {
  beforeEach(resetDb);

  it("lets an Admin add, edit and deactivate demo services; the list shows active ones only", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const created = await createPOST(
      jsonRequest("/api/catalogue/demo-services", { method: "POST", cookie, body: { name: "Home demo", description: "At the customer's home", unitCost: 250 } }),
    );
    expect(created.status).toBe(201);
    const { demoService } = await created.json();
    expect(demoService).toMatchObject({ name: "Home demo", unitCost: 250, active: true });

    const edited = await updatePATCH(
      jsonRequest(`/api/catalogue/demo-services/${demoService.id}`, { method: "PATCH", cookie, body: { unitCost: 300 } }),
      { params: { id: demoService.id } },
    );
    expect((await edited.json()).demoService.unitCost).toBe(300);

    await updatePATCH(
      jsonRequest(`/api/catalogue/demo-services/${demoService.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: demoService.id } },
    );
    const list = await (await listGET(jsonRequest("/api/catalogue/demo-services", { cookie }))).json();
    expect(list.demoServices).toEqual([]);
  });

  it("rejects a negative price and a Service Manager creating one", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });

    const bad = await createPOST(
      jsonRequest("/api/catalogue/demo-services", { method: "POST", cookie: await loginAs(admin.email, "Correct123!"), body: { name: "X", unitCost: -1 } }),
    );
    expect(bad.status).toBe(400);

    const forbidden = await createPOST(
      jsonRequest("/api/catalogue/demo-services", { method: "POST", cookie: await loginAs(sm.email, "Correct123!"), body: { name: "X", unitCost: 1 } }),
    );
    expect(forbidden.status).toBe(403);
  });
});
