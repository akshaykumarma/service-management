import { config } from "dotenv";

config({ path: ".env.test" });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error(
    `Refusing to run: DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}). ` +
      "This script truncates tables — never point it at a real database.",
  );
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function bench(label: string, iterations: number, fn: (i: number) => Promise<unknown>) {
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn(i);
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  console.log(
    `${label}: p50=${percentile(durations, 50).toFixed(1)}ms p95=${percentile(durations, 95).toFixed(1)}ms max=${durations[durations.length - 1].toFixed(1)}ms (n=${iterations})`,
  );
}

async function main() {
  const { db, pool } = await import("@/lib/db/client");
  const { sql, eq } = await import("drizzle-orm");
  const { stores } = await import("@/lib/db/schema");
  const { createStore, createUser, createTicket } = await import("../tests/helpers/factories");
  const { jsonRequest, loginAs } = await import("../tests/helpers/http");
  const { POST: partsPOST, GET: partsGET } = await import("@/app/api/catalogue/parts/route");
  const { POST: lineItemsPOST } = await import("@/app/api/tickets/[id]/line-items/route");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );

  const store = await createStore();
  await db.update(stores).set({ taxRate: "18.00" }).where(eq(stores.id, store.id));

  const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
  const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");

  // Seed 100 active parts so the catalogue list query has real rows to return.
  for (let i = 0; i < 100; i++) {
    await partsPOST(
      jsonRequest("/api/catalogue/parts", {
        method: "POST",
        cookie: superAdminCookie,
        body: { name: `Bench Part ${i}`, unitCost: 50 + i },
      }),
    );
  }
  const catalogueRes = await partsGET(jsonRequest("/api/catalogue/parts", { cookie: superAdminCookie }));
  const catalogue = (await catalogueRes.json()).parts;

  await bench("GET /api/catalogue/parts (100 active rows)", 30, async () => {
    await partsGET(jsonRequest("/api/catalogue/parts", { cookie: superAdminCookie }));
  });

  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");
  const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });

  await bench("POST /api/tickets/:id/line-items (bill recalculation)", 30, async (i) => {
    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: catalogue[i % catalogue.length].id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
  });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
