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
  const { sql } = await import("drizzle-orm");
  const { createStore, createTicket, createUser } = await import("../tests/helpers/factories");
  const { jsonRequest, loginAs } = await import("../tests/helpers/http");
  const { GET: ticketsGET } = await import("@/app/api/tickets/route");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services, machine_models,
        delivery_overrides, otp_verifications, notifications, status_history, tickets, stores RESTART IDENTITY CASCADE`,
  );

  const store = await createStore();
  const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(admin.email, "Correct123!");

  const names = ["Priya Sharma", "Rahul Verma", "Anita Rao", "John Smith", "Fatima Khan"];
  for (let i = 0; i < 500; i++) {
    await createTicket({
      storeId: store.id,
      createdBy: admin.id,
      status: i % 5 === 0 ? "completed" : "in_progress",
      customerName: names[i % names.length],
      machineModel: `Model-${i % 20}`,
    });
  }

  await bench("GET /api/tickets (unfiltered board load)", 50, () => ticketsGET(jsonRequest("/api/tickets", { cookie })));
  await bench("GET /api/tickets?customerName=Sharma (ILIKE contains)", 50, () =>
    ticketsGET(jsonRequest("/api/tickets?customerName=Sharma", { cookie })),
  );
  await bench("GET /api/tickets?status=in_progress", 50, () =>
    ticketsGET(jsonRequest("/api/tickets?status=in_progress", { cookie })),
  );

  const plan = await db.execute(
    sql`EXPLAIN SELECT * FROM tickets WHERE customer_name ILIKE '%Sharma%'`,
  );
  console.log("\nQuery plan for customer_name ILIKE '%Sharma%':");
  for (const row of plan.rows) console.log(" ", Object.values(row)[0]);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
