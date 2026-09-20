import { PgBoss } from "pg-boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE } from "@/jobs/send-whatsapp-message";
import { SWEEP_OTP_TIMEOUTS_QUEUE, scheduleSweepOtpTimeouts } from "@/jobs/sweep-otp-timeouts";

let bossPromise: Promise<PgBoss> | null = null;

/**
 * Lazily-started singleton. `instrumentation.ts` (production/dev — a single long-lived
 * server process) reuses this same instance to register the worker on server startup.
 * Tests instead start their own separate `PgBoss` instance in `tests/global-setup.ts`
 * (which runs once per whole test run, in its own process) to register the worker —
 * Vitest resets the module registry between test files, so this singleton gets
 * re-created per file there, and must never carry a `.work()` registration itself or
 * every test file would leave behind another redundant, never-stopped worker.
 */
export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
      boss.on("error", (err: Error) => console.error("pg-boss error", err));
      await boss.start();
      await boss.createQueue(SEND_WHATSAPP_MESSAGE_QUEUE);
      await boss.createQueue(SWEEP_OTP_TIMEOUTS_QUEUE);
      // schedule() persists a cron entry in pg-boss's own schema (upsert, idempotent) —
      // safe to call from this enqueue-side singleton even though it's re-created once
      // per test file; it never registers a worker itself.
      await scheduleSweepOtpTimeouts(boss);
      return boss;
    })();
  }
  return bossPromise;
}
