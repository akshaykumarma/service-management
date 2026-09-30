import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { db } from "@/lib/db/client";
import { statusHistory, tickets } from "@/lib/db/schema";
import { resolveReceivedAt } from "@/lib/tickets/received-date";

async function setup() {
  const store = await createStore();
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");
  const create = (extra: Record<string, unknown>) =>
    ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Back Dated",
          customerPhone: "+919876501000",
          machineModel: "Singer 4423",
          serialNumber: "SN-BD-1",
          issueDescription: "Logged late",
          ...extra,
        },
      }),
    );
  return { create };
}

describe("ticket intake options (post-v1 product feedback)", () => {
  beforeEach(resetDb);

  it("back-dates a ticket (and its Created timeline entry) to the given received date", async () => {
    const { create } = await setup();
    const res = await create({ receivedDate: "2026-01-15" });
    expect(res.status).toBe(201);
    const { ticket } = await res.json();

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.createdAt.toISOString()).toBe("2026-01-15T06:30:00.000Z"); // midday IST
    const [created] = await db.select().from(statusHistory).where(eq(statusHistory.ticketId, ticket.id));
    expect(created.createdAt.toISOString()).toBe(row.createdAt.toISOString());
  });

  it("rejects a received date in the future or an impossible one", async () => {
    const { create } = await setup();
    const future = await create({ receivedDate: "2999-01-01" });
    expect(future.status).toBe(400);
    expect((await future.json()).error.code).toBe("received_date_in_future");

    const invalid = await create({ receivedDate: "2026-02-31" });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("invalid_received_date");
  });

  it("saves a manually typed machine model that isn't in the machine models list", async () => {
    const { create } = await setup();
    const res = await create({ machineModel: "Totally New Model 9000" });
    expect(res.status).toBe(201);
    const { ticket } = await res.json();
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.machineModel).toBe("Totally New Model 9000");
  });
});

describe("resolveReceivedAt", () => {
  // 2026-09-29 20:00 UTC is already 2026-09-30 in India.
  const now = new Date("2026-09-29T20:00:00Z");

  it("treats a missing date or today's IST date as now", () => {
    expect(resolveReceivedAt(undefined, now)).toEqual({ ok: true, receivedAt: now });
    expect(resolveReceivedAt("2026-09-30", now)).toEqual({ ok: true, receivedAt: now });
  });

  it("uses the IST calendar for 'future'", () => {
    expect(resolveReceivedAt("2026-10-01", now)).toEqual({ ok: false, error: "received_date_in_future" });
  });
});
