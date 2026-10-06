import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board/);
}

test.describe("Board auto-refresh", () => {
  test("a demo ticket created elsewhere appears on the Demo Board without a manual refresh; the interval is remembered", async ({ page }) => {
    await page.clock.install();
    await login(page);

    const stamp = Date.now();
    const storeId = (await (await page.request.get(`${BASE}/api/stores`)).json()).stores[0].id;
    const service = await (
      await page.request.post(`${BASE}/api/catalogue/demo-services`, {
        data: { name: `E2E Refresh ${stamp}`, unitCost: 0 },
        headers: { origin: BASE },
      })
    ).json();

    await page.goto("/demo-board");
    const refresh = page.getByRole("group", { name: "Auto-refresh" });
    await expect(refresh.getByLabel("Auto-refresh", { exact: true })).toBeChecked();
    await expect(refresh.getByRole("status")).toContainText("Updated");

    const customer = `E2E Refresh Customer ${stamp}`;
    await expect(page.getByText(customer)).toHaveCount(0);

    // Someone else creates a demo ticket.
    const created = await page.request.post(`${BASE}/api/demo-tickets`, {
      data: {
        storeId,
        customerName: customer,
        customerPhone: "+919000000003",
        machineModel: "E2E Model",
        serialNumber: `E2E-RF-${stamp}`,
        invoiceNumber: `E2E-RF-INV-${stamp}`,
        demoServiceId: service.demoService.id,
        demoDate: new Date().toISOString().slice(0, 10),
      },
      headers: { origin: BASE },
    });
    expect(created.status()).toBe(201);

    // Not yet: nothing has reloaded the board.
    await expect(page.getByText(customer)).toHaveCount(0);
    // 30 seconds later it shows up on its own.
    await page.clock.fastForward("00:31");
    await expect(page.getByText(customer).first()).toBeVisible();

    // Turning it off, and the chosen interval, survive a reload.
    await refresh.getByLabel("Auto-refresh interval").selectOption("60");
    await refresh.getByLabel("Auto-refresh", { exact: true }).uncheck();
    await page.reload();
    await expect(refresh.getByLabel("Auto-refresh", { exact: true })).not.toBeChecked();
    await expect(refresh.getByLabel("Auto-refresh interval")).toHaveValue("60");
    await refresh.getByLabel("Auto-refresh", { exact: true }).check();
  });
});
