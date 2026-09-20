import { test, expect } from "@playwright/test";

test.describe("Login to dashboard", () => {
  test("logging in with valid credentials reaches a role-appropriate landing view", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows an error for invalid credentials without navigating away", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /invalid/i })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
