import { test, expect } from "@playwright/test";

test.describe("Message template management (005-customer-notifications, US6)", () => {
  test("Super Admin edits a template, sees it pending, and previews it before approval", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    await page.goto("/admin/templates");
    await expect(page.getByRole("heading", { name: "Completion notification" })).toBeVisible();

    const newBody = `Hi {{customer_name}}, e2e edit ${Date.now()}!`;
    const completionSection = page.locator("section", { has: page.getByRole("heading", { name: "Completion notification" }) });
    await completionSection.getByLabel("Edit wording").fill(newBody);
    await completionSection.getByRole("button", { name: "Submit for approval" }).click();

    await expect(completionSection.getByText(/Pending Meta approval/)).toContainText(newBody);

    await completionSection.getByLabel("Test-send phone number").fill("+919333333333");
    await completionSection.getByRole("button", { name: "Preview pending wording (no send)" }).click();
    await expect(completionSection.getByText("Rendered:")).toContainText("e2e edit");
  });
});
