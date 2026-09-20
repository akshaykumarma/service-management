import { startMockWhatsAppServer } from "../helpers/mock-whatsapp-server";

const WHATSAPP_PORT = 4570; // matches .env's WHATSAPP_API_URL for dev/e2e

/**
 * The e2e `webServer` (`npm run build && npm start`) is a real Next.js server whose
 * instrumentation.ts starts its own pg-boss worker — but nothing else stands up the mock
 * WhatsApp Cloud API .env points it at. Reuses the same mock server Vitest's
 * globalSetup uses, rather than a second implementation.
 */
export default async function globalSetup() {
  const server = await startMockWhatsAppServer(WHATSAPP_PORT);
  return async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  };
}
