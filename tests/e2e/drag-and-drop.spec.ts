import { test, expect } from "@playwright/test";

async function createTicketAndGetId(page: import("@playwright/test").Page, label: string): Promise<string> {
  await page.goto("/tickets/new");
  await page.getByLabel("Store").selectOption({ index: 1 });
  await page.getByLabel("Customer name").fill(`${label} Customer`);
  await page.getByLabel("Customer phone").fill(`+9198${Date.now().toString().slice(-8)}`);
  await page.getByLabel("Machine model").fill(`${label} Model ${Date.now()}`);
  await page.getByLabel("Serial number").fill(`SN-${label}-${Date.now()}`);
  await page.getByLabel("Issue description").fill(`${label} e2e test`);
  await page.getByRole("button", { name: "Create ticket" }).click();
  const href = await page.getByRole("link", { name: "View full ticket" }).getAttribute("href");
  return href!.split("/").pop()!;
}

test.describe("Drag-and-drop status updates on the board (006-dashboard-reporting, US2)", () => {
  test("moves a card via keyboard activation (WCAG 2.1 AA) to a valid next status", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    const ticketId = await createTicketAndGetId(page, "E2E DnD");

    await page.goto("/board");
    const card = page.locator(`li[data-ticket-id="${ticketId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "open");

    // @dnd-kit's keyboard sensor: focus the draggable, Space to pick up, ArrowRight to
    // move to the next droppable column, Space to drop. A short pause between key
    // presses gives dnd-kit's rect measurement/re-render a tick to settle before the
    // next key is processed.
    await card.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("Space");

    await expect(page.locator(`li[data-ticket-id="${ticketId}"]`)).toHaveAttribute("data-status", "in_progress");
  });

  test("prompts for a mandatory comment when dragging into a comment-required transition", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    const ticketId = await createTicketAndGetId(page, "E2E DnD Comment");

    await page.goto("/board");
    const card = page.locator(`li[data-ticket-id="${ticketId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "open");

    let dialogSeen = false;
    page.once("dialog", (dialog) => {
      dialogSeen = true;
      dialog.accept("moved backward via drag for e2e test");
    });

    // Open -> On Hold requires a comment (entering On Hold always does, per 003).
    await card.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("Space");

    await expect.poll(() => dialogSeen).toBe(true);
    await expect(page.locator(`li[data-ticket-id="${ticketId}"]`)).toHaveAttribute("data-status", "on_hold");
  });

  test("rejects an invalid transition and the card returns to its original column", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_SUPER_ADMIN_PASSWORD ?? "SuperSecret123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);

    const ticketId = await createTicketAndGetId(page, "E2E DnD Invalid");

    await page.goto("/board");
    const card = page.locator(`li[data-ticket-id="${ticketId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "open");

    // Open straight to Delivered — spec.md's own named example of an invalid move
    // (skips In Progress entirely) — must be rejected, card stays in Open.
    await card.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("Space");

    await expect(page.getByText(/isn't allowed/)).toBeVisible();
    await expect(page.locator(`li[data-ticket-id="${ticketId}"]`)).toHaveAttribute("data-status", "open");
  });
});
