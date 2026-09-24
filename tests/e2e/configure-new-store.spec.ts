import { test, expect } from "@playwright/test";

test.describe("Configure a new store end-to-end (007-admin-console, US2)", () => {
  test("Super Admin creates a store, activates it, and it's usable for ticket intake", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    const storeName = `E2E Store ${Date.now()}`;
    await page.goto("/admin/stores");
    await page.getByRole("button", { name: "Add store" }).click();
    await page.getByLabel("Name", { exact: true }).fill(storeName);
    await page.getByLabel("Address").fill("42 E2E Street");
    await page.getByLabel("Primary contact").fill("E2E Contact");
    await page.getByLabel("WhatsApp number").fill("+919876500000");
    await page.getByLabel("Tax rate (%)").fill("18");
    await page.getByRole("button", { name: "Create store" }).click();

    const storeArticle = page.locator("article", { has: page.getByRole("heading", { name: new RegExp(storeName) }) });
    await expect(storeArticle).toBeVisible();
    await expect(storeArticle).toContainText("Inactive");

    await storeArticle.getByRole("button", { name: "Activate" }).click();
    await expect(storeArticle).toContainText("Active");
    await expect(storeArticle).not.toContainText("Inactive");

    // Now usable at intake.
    await page.goto("/tickets/new");
    await expect(page.getByLabel("Store")).toContainText(storeName);
  });
});
