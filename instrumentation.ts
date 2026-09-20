/**
 * Next.js instrumentation hook — runs once per server process on startup (dev or prod).
 * Starts the pg-boss worker here rather than lazily inside a route handler, so it's
 * running exactly once regardless of which request happens to trigger the module first.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getBoss } = await import("@/lib/jobs/boss");
    const { registerSendWhatsAppMessageWorker } = await import("@/jobs/send-whatsapp-message");
    const boss = await getBoss();
    await registerSendWhatsAppMessageWorker(boss);
  }
}
