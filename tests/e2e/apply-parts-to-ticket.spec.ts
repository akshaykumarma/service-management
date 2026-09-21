import { test, expect } from "@playwright/test";

test.describe("Apply parts to ticket", () => {
  test("adding a part to an in-progress ticket updates the live bill display", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    // Ensure a catalogue part exists to select (idempotent-ish: unique name per run).
    const partName = `E2E Part ${Date.now()}`;
    await page.goto("/admin/catalogue");
    await page.getByLabel("Name", { exact: true }).first().fill(partName);
    await page.getByLabel("Unit cost", { exact: true }).first().fill("150");
    await page.getByRole("button", { name: "Add part" }).click();
    await expect(page.getByText(partName)).toBeVisible();

    // Create a ticket, then move it to In Progress via the API-backed status control.
    await page.goto("/tickets/new");
    // 007-admin-console can add more active stores over time (the intake form no longer
    // auto-selects once more than one exists) — select explicitly rather than relying on
    // there being exactly one.
    await page.getByLabel("Store").selectOption({ index: 1 });
    await page.getByLabel("Customer name").fill("E2E Billing Customer");
    await page.getByLabel("Customer phone").fill("+919999900002");
    await page.getByLabel("Machine model").fill(`E2E-Bill-Model-${Date.now()}`);
    await page.getByLabel("Issue description").fill("Billing e2e test");
    await page.getByRole("button", { name: "Create ticket" }).click();
    await page.getByRole("link", { name: "View full ticket" }).click();

    await page.getByLabel("New status").selectOption("in_progress");
    await page.getByRole("button", { name: "Update status" }).click();

    await page.getByLabel("Item type").selectOption("part");
    await page.getByLabel("Catalogue item").selectOption({ label: partName });
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Add to ticket" }).click();

    await expect(page.locator('dl[aria-label="Bill summary"]')).toContainText("150.00");
  });
});
