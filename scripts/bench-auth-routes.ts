import { config } from "dotenv";

// Set env vars BEFORE any dynamic import of lib/db/client, since that module reads
// process.env.DATABASE_URL at module-load time — a static top-of-file import would have
// already constructed the Pool against .env's dev DATABASE_URL before this override ran
// (exactly what happened once: this script silently truncated the dev database instead
// of the test one). Dynamic imports below guarantee correct ordering.
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

async function bench(label: string, iterations: number, fn: () => Promise<unknown>) {
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
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
  const { jsonRequest, extractSessionCookie } = await import("../tests/helpers/http");
  const { POST: loginPOST } = await import("@/app/api/auth/login/route");
  const { GET: sessionGET } = await import("@/app/api/auth/session/route");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users, stores RESTART IDENTITY CASCADE`,
  );

  const user = await createUser({ email: "bench@example.com", password: "Correct123!" });

  await bench("POST /api/auth/login", 50, async () => {
    await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
  });

  const loginRes = await loginPOST(
    jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
  );
  const cookie = extractSessionCookie(loginRes)!;

  await bench("GET /api/auth/session", 100, async () => {
    await sessionGET(jsonRequest("/api/auth/session", { cookie }));
  });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
