import { test, expect } from "@playwright/test";

test.describe("Intake to history", () => {
  test("creating a ticket via the intake form lands on its detail page showing no prior history", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/tickets/new");
    await page.getByLabel("Customer name").fill("E2E Customer");
    await page.getByLabel("Customer phone").fill("+919999900001");
    await page.getByLabel("Machine model").fill(`E2E-Model-${Date.now()}`);
    await page.getByLabel("Issue description").fill("Playwright end-to-end intake test");
    await page.getByRole("button", { name: "Create ticket" }).click();

    await expect(page.getByRole("heading", { name: /ticket created: svc-\d{4}-\d{5}/i })).toBeVisible();
    await expect(page.getByText(/no prior service history/i)).toBeVisible();

    await page.getByRole("link", { name: "View full ticket" }).click();
    await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: /SVC-\d{4}-\d{5}/i })).toBeVisible();
  });
});
