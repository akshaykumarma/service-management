import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { db } from "@/lib/db/client";

export const SWEEP_OTP_TIMEOUTS_QUEUE = "sweep-otp-timeouts";
const SWEEP_CRON = "* * * * *"; // every minute — fine-grained enough against a 10-minute expiry

/**
 * FR-023: locks an attempt whose current code (or its one resend, whichever is latest —
 * lib/delivery/otp.ts's latestRow) has expired with zero wrong entries and zero resend
 * still pending. The 3-strikes case already sets locked=true synchronously in
 * verifyOtp; this only ever catches the "timed out untouched" case that nothing else
 * observes as it happens.
 */
export async function sweepTimedOutOtpAttempts(): Promise<void> {
  await db.execute(sql`
    UPDATE otp_verifications
    SET locked = true
    WHERE locked = false AND verified_at IS NULL AND expires_at < now()
  `);
}

export async function registerSweepOtpTimeoutsWorker(boss: PgBoss): Promise<void> {
  await boss.work(SWEEP_OTP_TIMEOUTS_QUEUE, async () => {
    await sweepTimedOutOtpAttempts();
  });
}

export async function scheduleSweepOtpTimeouts(boss: PgBoss): Promise<void> {
  await boss.schedule(SWEEP_OTP_TIMEOUTS_QUEUE, SWEEP_CRON);
}
