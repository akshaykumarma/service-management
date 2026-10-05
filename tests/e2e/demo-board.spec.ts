import { test, expect, type Page } from "@playwright/test";
import { getReceivedMessages, resetMockWhatsApp } from "../helpers/whatsapp-mock-client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board/);
}

// Same-origin API calls from the logged-in page (the app's CSRF check wants an Origin).
const api = (page: Page, method: "post" | "patch", path: string, data: unknown) =>
  page.request[method](`${BASE}${path}`, { data, headers: { origin: BASE } });

test.describe("Demo Board (008-demo-board)", () => {
  test("create a demo from New Ticket with the repeat-demo warning, assign a technician, and they get a WhatsApp with the short link", async ({ page }) => {
    await resetMockWhatsApp();
    await login(page);

    // Sidebar: Service Board, then Demo Board.
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await expect(nav.getByRole("link")).toContainText(["Service Board", "Demo Board"]);

    const stamp = Date.now();
    const storeId = (await (await page.request.get(`${BASE}/api/stores`)).json()).stores[0].id;
    const service = await (await api(page, "post", "/api/catalogue/demo-services", { name: `E2E Demo ${stamp}`, unitCost: 0 })).json();
    const techPhone = `+9198${String(stamp).slice(-8)}`;
    const tech = await (
      await api(page, "post", "/api/auth/users", {
        name: `E2E Tech ${stamp}`,
        email: `e2e-tech-${stamp}@example.com`,
        role: "technician",
        storeIds: [storeId],
        password: "E2eTechPass123!",
        phone: techPhone,
      })
    ).json();
    expect(tech.user.phone).toBe(techPhone);

    const serial = `E2E-SN-${stamp}`;
    const customer = `E2E Demo Customer ${stamp}`;
    // Two earlier demos on the same serial, so the next one is the 3rd.
    for (let i = 0; i < 2; i++) {
      const res = await api(page, "post", "/api/demo-tickets", {
        storeId,
        customerName: "E2E Earlier",
        customerPhone: "+919000000001",
        machineModel: "E2E Model",
        serialNumber: serial,
        invoiceNumber: `E2E-INV-${stamp}-${i}`,
        demoServiceId: service.demoService.id,
        demoDate: new Date().toISOString().slice(0, 10),
      });
      expect(res.status()).toBe(201);
    }

    await page.goto("/tickets/new");
    await page.getByLabel("Demo ticket").check();
    await page.getByLabel("Store").selectOption(storeId);
    await page.getByLabel("Customer name").fill(customer);
    await page.getByLabel("Phone number").fill("+919000000002");
    await page.getByLabel("Model number", { exact: true }).selectOption("__other__");
    await page.getByLabel("Model number (not in the list)").fill("E2E Model");
    await page.getByLabel("Serial number").fill(serial);
    await page.getByLabel("Invoice number").fill(`E2E-INV-${stamp}-new`);
    await expect(page.getByRole("alert").filter({ hasText: "3rd demo" })).toBeVisible();
    await page.getByLabel("Demo service").selectOption(service.demoService.id);
    await page.getByLabel("Demo date").fill(new Date().toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create demo ticket anyway" }).click();
    await expect(page.getByRole("heading", { name: /Demo ticket created: [A-Z0-9]+-DEMO-\d{4}-\d{5}/ })).toBeVisible();

    await page.getByRole("link", { name: "View demo ticket" }).click();
    await expect(page.getByRole("heading", { name: customer })).toBeVisible();

    await page.getByLabel("Assigned technician").click();
    await page.getByRole("button", { name: `E2E Tech ${stamp}` }).click();
    await page.getByRole("button", { name: "Assign & notify" }).click();
    await expect(page.getByText("The technician has been sent a WhatsApp message")).toBeVisible();
    await expect(page.locator('dt:has-text("Status") + dd')).toHaveText("Assigned");

    await expect
      .poll(async () => (await getReceivedMessages()).find((m) => m.to === techPhone && m.templateType === "demo_assignment"), { timeout: 15000 })
      .toBeTruthy();
    const message = (await getReceivedMessages()).find((m) => m.to === techPhone)!;
    expect(message.params.ticket_url).toMatch(/\/t\/[A-Za-z0-9]{8}$/);

    // The short link opens the ticket.
    await page.goto(new URL(message.params.ticket_url).pathname);
    await expect(page.getByRole("heading", { name: customer })).toBeVisible();

    // It's on the Demo Board, not the Service Board.
    await page.goto("/demo-board");
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.locator(".board-column.status-assigned").getByText(customer)).toBeVisible();
    await page.goto("/board");
    await expect(page.getByText(customer)).toHaveCount(0);
  });
});
