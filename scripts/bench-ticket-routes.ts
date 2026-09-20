import { config } from "dotenv";

// See scripts/bench-auth-routes.ts for why env vars must be set before any dynamic
// import of lib/db/client — a static top-of-file import would read the wrong
// DATABASE_URL before this override took effect.
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
  const { sql } = await import("drizzle-orm");
  const { createStore, createUser, createTicket } = await import("../tests/helpers/factories");
  const { jsonRequest, loginAs } = await import("../tests/helpers/http");
  const { POST: ticketsPOST } = await import("@/app/api/tickets/route");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );

  const store = await createStore();
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");

  // Seed 200 closed tickets for a fixed model so the history-lookup query has real rows
  // to scan/filter, not an empty table.
  for (let i = 0; i < 200; i++) {
    await createTicket({ storeId: store.id, createdBy: sm.id, machineModel: "Bench-Model", status: "completed" });
  }

  await bench("POST /api/tickets (with history lookup)", 30, async (i) => {
    await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: `Bench Customer ${i}`,
          customerPhone: `+9198765${String(i).padStart(5, "0")}`,
          machineModel: "Bench-Model",
          issueDescription: "Benchmark run",
        },
      }),
    );
  });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
