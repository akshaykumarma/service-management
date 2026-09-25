import { test, expect } from "@playwright/test";

// A random 3-letter code (this app's own store-code format) rather than a Date.now()
// suffix — two specs creating a store in the same run, possibly in parallel workers,
// could otherwise land on the same millisecond and collide on the store_code unique
// constraint.
function randomStoreCode(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
}

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
    await page.getByLabel("Store code").fill(randomStoreCode());
    await page.getByLabel("Address").fill("42 E2E Street");
    await page.getByLabel("Primary contact").fill("E2E Contact");
    await page.getByLabel("WhatsApp number").fill("+919876500000");
    await page.getByLabel("Tax rate (%)").fill("18");
    await page.getByRole("button", { name: "Create store" }).click();

    const storeRow = page.locator("tbody tr", { hasText: storeName });
    await expect(storeRow).toBeVisible();
    await expect(storeRow).toContainText("Inactive");

    await storeRow.getByRole("button", { name: "Activate" }).click();
    await expect(storeRow).toContainText("Active");
    await expect(storeRow).not.toContainText("Inactive");

    // Now usable at intake.
    await page.goto("/tickets/new");
    await expect(page.getByLabel("Store")).toContainText(storeName);
  });
});
