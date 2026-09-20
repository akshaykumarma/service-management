import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.test", override: true });

import { db, pool } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { createUser } from "../tests/helpers/factories";
import { jsonRequest, extractSessionCookie } from "../tests/helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";

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
