import http, { type Server } from "http";
import { randomUUID } from "crypto";

/**
 * Runs in Vitest's globalSetup process (separate from test-file worker processes), so
 * control is exposed over HTTP rather than shared module state — test files use
 * tests/helpers/whatsapp-mock-client.ts to drive it.
 */
export async function startMockWhatsAppServer(port: number): Promise<Server> {
  const failingPhones = new Set<string>();
  const received: { to: string; templateType: string; params: Record<string, string>; messageId: string }[] = [];

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : {};

      if (req.method === "POST" && req.url === "/messages") {
        const to: string = payload.to;
        if (failingPhones.has(to)) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Simulated send failure" } }));
          return;
        }
        const messageId = `wamid.${randomUUID()}`;
        received.push({ to, templateType: payload.templateType, params: payload.params, messageId });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messages: [{ id: messageId }] }));
        return;
      }

      if (req.method === "POST" && req.url === "/__control/fail") {
        if (payload.shouldFail) failingPhones.add(payload.phone);
        else failingPhones.delete(payload.phone);
        res.writeHead(200).end("{}");
        return;
      }

      if (req.method === "POST" && req.url === "/__control/reset") {
        failingPhones.clear();
        received.length = 0;
        res.writeHead(200).end("{}");
        return;
      }

      if (req.method === "GET" && req.url === "/__control/received") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ received }));
        return;
      }

      res.writeHead(404).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}
