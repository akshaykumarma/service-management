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
  const { createStore, createUser, createTicket } = await import("../tests/helpers/factories");
  const { jsonRequest, loginAs } = await import("../tests/helpers/http");
  const { PATCH: statusPATCH } = await import("@/app/api/tickets/[id]/status/route");
  const { POST: deliverPOST } = await import("@/app/api/tickets/[id]/deliver/route");
  const { POST: verifyPOST } = await import("@/app/api/tickets/[id]/deliver/verify/route");
  const { verifyOtpCode } = await import("@/lib/delivery/otp");
  const { otpVerifications } = await import("@/lib/db/schema");
  const { eq, desc } = await import("drizzle-orm");

  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services,
        manual_notification_confirmations, delivery_overrides, otp_verifications, notifications, message_templates,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );

  const store = await createStore();
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");

  // Synchronous part of completion-notification enqueue: the PATCH request itself only
  // waits on the DB write + boss.send() (an INSERT into pg-boss's own queue table) —
  // the WhatsApp API call happens later, in the worker, off this request entirely.
  await bench("PATCH /api/tickets/:id/status → completed (notification enqueue)", 30, async (i) => {
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "completed", comment: null },
      }),
      { params: { id: ticket.id } },
    );
    void i;
  });

  // OTP verification: hashing + one UPDATE, no network call.
  const verifyTicket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
  await deliverPOST(jsonRequest(`/api/tickets/${verifyTicket.id}/deliver`, { method: "POST", cookie }), {
    params: { id: verifyTicket.id },
  });
  const [row] = await db
    .select()
    .from(otpVerifications)
    .where(eq(otpVerifications.ticketId, verifyTicket.id))
    .orderBy(desc(otpVerifications.issuedAt))
    .limit(1);
  let correctCode = "";
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, "0");
    if (verifyOtpCode(candidate, row.codeHash)) {
      correctCode = candidate;
      break;
    }
  }

  await bench("POST /api/tickets/:id/deliver/verify (wrong code, no transition)", 30, async () => {
    await verifyPOST(
      jsonRequest(`/api/tickets/${verifyTicket.id}/deliver/verify`, {
        method: "POST",
        cookie,
        body: { code: "999999" },
      }),
      { params: { id: verifyTicket.id } },
    );
  });

  await verifyPOST(
    jsonRequest(`/api/tickets/${verifyTicket.id}/deliver/verify`, { method: "POST", cookie, body: { code: correctCode } }),
    { params: { id: verifyTicket.id } },
  );

  // triggerCompletionNotification's getBoss() opens its own separate connection
  // (lib/jobs/boss.ts's enqueue-side singleton) — closing only `pool` above leaves it
  // open, which is why this script previously never exited on its own.
  const { getBoss } = await import("@/lib/jobs/boss");
  const boss = await getBoss();
  await boss.stop({ graceful: false });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
