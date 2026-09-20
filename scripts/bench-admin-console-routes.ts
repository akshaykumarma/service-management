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
  const { createUser } = await import("../tests/helpers/factories");
  const { jsonRequest, loginAs } = await import("../tests/helpers/http");
  const { GET: storesGET, POST: storesPOST } = await import("@/app/api/admin/stores/route");
  const { POST: machineModelsPOST } = await import("@/app/api/admin/machine-models/route");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services, machine_models,
        manual_notification_confirmations, delivery_overrides, otp_verifications, notifications, message_templates,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );

  const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
  const cookie = await loginAs(superAdmin.email, "Correct123!");

  for (let i = 0; i < 20; i++) {
    await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: `Bench Store ${i}`, address: "A", primaryContact: "B", whatsappNumber: "+910000000000", taxRate: 18 },
      }),
    );
  }

  await bench("GET /api/admin/stores (20 rows)", 30, async () => {
    await storesGET(jsonRequest("/api/admin/stores", { cookie }));
  });

  await bench("POST /api/admin/machine-models", 30, async (i) => {
    await machineModelsPOST(
      jsonRequest("/api/admin/machine-models", {
        method: "POST",
        cookie,
        body: { name: `Bench Model ${i}`, manufacturer: "LG" },
      }),
    );
  });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
