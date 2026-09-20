import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as ticketsPOST } from "@/app/api/tickets/route";

describe("Ticket-number generation under concurrent creation", () => {
  beforeEach(resetDb);

  it("issues unique, gapless ticket numbers for N concurrent creations at the same store", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const N = 15;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        ticketsPOST(
          jsonRequest("/api/tickets", {
            method: "POST",
            cookie,
            body: {
              storeId: store.id,
              customerName: `Customer ${i}`,
              customerPhone: `+91900000${String(i).padStart(4, "0")}`,
              machineModel: "Concurrent-Model",
              issueDescription: "Concurrency test",
            },
          }),
        ),
      ),
    );

    const ticketNumbers = await Promise.all(responses.map(async (r) => (await r.json()).ticket.ticketNumber));
    const sequenceNumbers = ticketNumbers.map((tn: string) => Number(tn.split("-")[2])).sort((a, b) => a - b);

    expect(new Set(ticketNumbers).size).toBe(N);
    expect(sequenceNumbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });
});
