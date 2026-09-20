import { test, expect } from "@playwright/test";
import { getReceivedMessages, resetMockWhatsApp, setPhoneFailure } from "../helpers/whatsapp-mock-client";

test.describe("Complete and deliver (005-customer-notifications, US1+US3)", () => {
  test("sends a completion notification, then delivers via OTP verification", async ({ page }) => {
    const customerPhone = `+9198765${Date.now().toString().slice(-5)}`;
    await resetMockWhatsApp();
    await setPhoneFailure(customerPhone, false);

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/tickets/new");
    // 007-admin-console can add more active stores over time (the intake form no longer
    // auto-selects once more than one exists) — select explicitly rather than relying on
    // there being exactly one.
    await page.getByLabel("Store").selectOption({ index: 1 });
    await page.getByLabel("Customer name").fill("E2E Delivery Customer");
    await page.getByLabel("Customer phone").fill(customerPhone);
    await page.getByLabel("Machine model").fill(`E2E-Deliver-Model-${Date.now()}`);
    await page.getByLabel("Issue description").fill("Delivery e2e test");
    await page.getByRole("button", { name: "Create ticket" }).click();
    await page.getByRole("link", { name: "View full ticket" }).click();

    const statusValue = page.locator('dt:has-text("Status") + dd');

    await page.getByLabel("New status").selectOption("in_progress");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(statusValue).toContainText("in_progress");

    await page.getByLabel("New status").selectOption("completed");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(statusValue).toContainText("completed");

    // Completion notification (US1): poll the mock WhatsApp server's received log.
    await expect
      .poll(async () => {
        const received = await getReceivedMessages();
        return received.some((m) => m.to === customerPhone && m.templateType === "completion");
      }, { timeout: 10_000 })
      .toBe(true);

    // Delivery verification (US3): initiate, retrieve the real code from the mock
    // server's log (never visible in the UI, by design), then verify it.
    await page.getByRole("button", { name: "Start delivery verification" }).click();
    await expect(page.getByLabel("One-time code")).toBeVisible();

    await expect
      .poll(async () => {
        const received = await getReceivedMessages();
        return received.some((m) => m.to === customerPhone && m.templateType === "otp");
      }, { timeout: 10_000 })
      .toBe(true);

    const received = await getReceivedMessages();
    const otpMessage = received.find((m) => m.to === customerPhone && m.templateType === "otp")!;

    await page.getByLabel("One-time code").fill(otpMessage.params.otp_code);
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(statusValue).toContainText("delivered");
  });
});
