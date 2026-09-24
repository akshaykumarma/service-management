import { test, expect } from "@playwright/test";

test.describe("Board to report end-to-end (006-dashboard-reporting, US1-US5)", () => {
  test("a ticket created and completed today is visible on the board and counted in today's report", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    const storeName = `E2E Report Store ${Date.now()}`;
    await page.goto("/admin/stores");
    await page.getByRole("button", { name: "Add store" }).click();
    await page.getByLabel("Name", { exact: true }).fill(storeName);
    await page.getByLabel("Address").fill("1 Report Street");
    await page.getByLabel("Primary contact").fill("Report Contact");
    await page.getByLabel("WhatsApp number").fill("+919876500001");
    await page.getByLabel("Tax rate (%)").fill("18");
    await page.getByRole("button", { name: "Create store" }).click();
    const storeArticle = page.locator("article", { has: page.getByRole("heading", { name: new RegExp(storeName) }) });
    await storeArticle.getByRole("button", { name: "Activate" }).click();
    await expect(storeArticle).toContainText("Active");

    const partName = `E2E Report Part ${Date.now()}`;
    await page.goto("/admin/catalogue");
    await page.getByLabel("Name", { exact: true }).first().fill(partName);
    await page.getByLabel("Unit cost", { exact: true }).first().fill("300");
    await page.getByRole("button", { name: "Add part" }).click();
    await expect(page.getByText(partName)).toBeVisible();

    await page.goto("/tickets/new");
    await page.getByLabel("Store", { exact: true }).selectOption({ label: storeName });
    const customerName = `E2E Report Customer ${Date.now()}`;
    await page.getByLabel("Customer name").fill(customerName);
    await page.getByLabel("Customer phone").fill("+919999900003");
    await page.getByLabel("Machine model").fill(`E2E-Report-Model-${Date.now()}`);
    await page.getByLabel("Serial number").fill(`SN-Report-${Date.now()}`);
    await page.getByLabel("Issue description").fill("Board-to-report e2e test");
    await page.getByRole("button", { name: "Create ticket" }).click();
    await page.getByRole("link", { name: "View full ticket" }).click();
    const ticketUrl = page.url();

    // Board: the new ticket must appear in the Open column, scoped to the just-created store.
    await page.goto("/board");
    await expect(page.locator(`[data-ticket-id]`, { hasText: customerName })).toBeVisible();

    await page.goto(ticketUrl);
    const statusValue = page.locator('dt:has-text("Status") + dd');
    await page.getByLabel("New status").selectOption("in_progress");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(statusValue).toContainText("in_progress");

    await page.getByLabel("Item type").selectOption("part");
    await page.getByLabel("Catalogue item").selectOption({ label: partName });
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Add to ticket" }).click();
    await expect(page.locator('table caption:has-text("Applied parts")')).toBeVisible();
    await expect(page.locator('dl[aria-label="Bill summary"]')).toContainText("300.00");

    await page.getByLabel("New status").selectOption("completed");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.locator('dt:has-text("Status") + dd')).toContainText("completed");

    // Reports: the ticket must show up in the ticket-details table for today's range.
    const today = new Date().toISOString().slice(0, 10);
    await page.goto("/reports");
    await page.getByLabel("Filter by store").selectOption({ label: storeName });
    await page.getByLabel("Filter from date").fill(today);
    await page.getByLabel("Filter to date (defaults to today)").fill(today);
    await page.getByRole("button", { name: "Apply filters" }).click();

    const row = page.locator("tbody tr", { hasText: customerName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("300.00");
  });
});
