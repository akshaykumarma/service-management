import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { config } from "dotenv";
// @ts-expect-error -- s3rver ships no types
import S3rver from "s3rver";
import { PgBoss } from "pg-boss";
import { startMockWhatsAppServer } from "./helpers/mock-whatsapp-server";

const S3_PORT = 4569;
const BUCKET = "intake-photos";
const WHATSAPP_PORT = 4570;

export default async function setup() {
  // globalSetup runs in its own process, separate from the worker(s) that load
  // tests/setup.ts — DATABASE_URL etc. need loading here independently.
  config({ path: ".env.test" });

  const directory = mkdtempSync(path.join(tmpdir(), "s3rver-"));
  const instance = new S3rver({
    port: S3_PORT,
    address: "localhost",
    silent: true,
    directory,
    configureBuckets: [{ name: BUCKET }],
  });

  await instance.run();

  process.env.MINIO_ENDPOINT = `http://localhost:${S3_PORT}`;
  process.env.MINIO_ACCESS_KEY = "S3RVER";
  process.env.MINIO_SECRET_KEY = "S3RVER";
  process.env.MINIO_BUCKET = BUCKET;

  const whatsappServer = await startMockWhatsAppServer(WHATSAPP_PORT);
  process.env.WHATSAPP_API_URL = `http://localhost:${WHATSAPP_PORT}`;
  process.env.WHATSAPP_WEBHOOK_SECRET = "test-webhook-secret";

  // A single worker for the whole test run (see lib/jobs/boss.ts's comment on why this
  // lives here rather than in the app's own enqueue-side singleton): test-file code
  // (running in the worker fork) enqueues jobs via lib/jobs/boss.ts's getBoss(), and
  // THIS instance — in the globalSetup process, started exactly once — is what actually
  // processes them, since both point at the same test database.
  const { SEND_WHATSAPP_MESSAGE_QUEUE, registerSendWhatsAppMessageWorker } = await import(
    "../jobs/send-whatsapp-message"
  );
  const { SWEEP_OTP_TIMEOUTS_QUEUE, registerSweepOtpTimeoutsWorker } = await import("../jobs/sweep-otp-timeouts");
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
  boss.on("error", (err) => console.error("pg-boss error (test worker)", err));
  await boss.start();
  await boss.createQueue(SEND_WHATSAPP_MESSAGE_QUEUE);
  await boss.createQueue(SWEEP_OTP_TIMEOUTS_QUEUE);
  await registerSendWhatsAppMessageWorker(boss);
  // Tests exercise sweepTimedOutOtpAttempts() directly for deterministic timing rather
  // than waiting on this cron (1-minute granularity is too coarse for a test suite) —
  // registered here anyway so the queue behaves the same as in production.
  await registerSweepOtpTimeoutsWorker(boss);

  return async function teardown() {
    await new Promise<void>((resolve, reject) => {
      instance.close((err: Error | null) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      whatsappServer.close((err) => (err ? reject(err) : resolve()));
    });
    await boss.stop({ graceful: false });
  };
}
