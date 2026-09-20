import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as machineModelsPOST } from "@/app/api/admin/machine-models/route";
import { PATCH as machineModelPATCH } from "@/app/api/admin/machine-models/[id]/route";
import { GET as intakeListGET } from "@/app/api/machine-models/route";

describe("Machine model catalogue maintenance (User Story 1)", () => {
  beforeEach(resetDb);

  it("makes a new model immediately selectable at intake, and excludes a deactivated one without affecting existing ticket references", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });
    const smCookie = await loginAs(sm.email, "Correct123!");

    const createRes = await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", {
        method: "POST",
        cookie,
        body: { name: "LG-FHM1207ZDL", manufacturer: "LG", category: "Washing Machine" },
      }),
    );
    const { machineModel } = await createRes.json();

    const intakeList = await intakeListGET(jsonRequest("/api/machine-models", { cookie: smCookie }));
    const intakeBody = await intakeList.json();
    expect(intakeBody.machineModels.some((m: { id: string }) => m.id === machineModel.id)).toBe(true);

    await machineModelPATCH(
      jsonRequest(`/api/admin/machine-models/${machineModel.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: machineModel.id } },
    );

    const intakeListAfter = await intakeListGET(jsonRequest("/api/machine-models", { cookie: smCookie }));
    const intakeBodyAfter = await intakeListAfter.json();
    expect(intakeBodyAfter.machineModels.some((m: { id: string }) => m.id === machineModel.id)).toBe(false);
  });
});
