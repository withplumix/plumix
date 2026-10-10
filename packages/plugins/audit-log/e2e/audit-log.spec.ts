import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, openPlaygroundDb, test } from "plumix/test/playwright";

// The relative source path, not the package export: lint runs before this
// package is built, so `./dist/db/schema` would not exist yet.
import { auditLog } from "../src/db/schema.js";

/**
 * Seeded directly because audit hooks fire only through the request pipeline;
 * drizzle's typed builder surfaces schema drift as a type error.
 */
async function seedAuditRows(): Promise<void> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  await db.insert(auditLog).values([
    {
      event: "user:created",
      subjectType: "user",
      subjectId: "2",
      subjectLabel: "alpha@example.test",
      actorId: 1,
      actorLabel: "user-1@example.test",
    },
    {
      event: "user:updated",
      subjectType: "user",
      subjectId: "2",
      subjectLabel: "alpha@example.test",
      actorId: 1,
      actorLabel: "user-1@example.test",
    },
    {
      event: "entry:published",
      subjectType: "entry",
      subjectId: "10",
      subjectLabel: "Hello world",
      actorId: 1,
      actorLabel: "user-1@example.test",
    },
  ]);
}

test.describe
  .serial("@plumix/plugin-audit-log — worker-driven happy path", () => {
  test.beforeAll(seedAuditRows);

  test("audit log table renders the seeded rows", async ({ page }) => {
    await page.goto("pages/audit-log");
    await expect(page.getByTestId("audit-log-shell")).toBeVisible();

    const rows = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("entry:published");
    await expect(rows.nth(1)).toContainText("user:updated");
    await expect(rows.nth(2)).toContainText("user:created");
  });

  test("event-prefix filter narrows the table to matching events", async ({
    page,
  }) => {
    await page.goto("pages/audit-log");
    await expect(page.getByTestId("audit-log-table")).toBeVisible();

    await page.getByTestId("audit-log-filter-event-prefix").click();
    await page.getByTestId("audit-log-filter-event-prefix-user:").click();

    const rows = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("user:updated");
    await expect(rows.nth(1)).toContainText("user:created");
  });

  test("reset clears the filter and restores the full list", async ({
    page,
  }) => {
    await page.goto("pages/audit-log");
    await page.getByTestId("audit-log-filter-event-prefix").click();
    await page.getByTestId("audit-log-filter-event-prefix-user:").click();
    const filtered = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(filtered).toHaveCount(2);

    await page.getByTestId("audit-log-filter-reset").click();

    const rows = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(rows).toHaveCount(3);
  });

  test("filter state survives a page reload via URL params", async ({
    page,
  }) => {
    await page.goto("pages/audit-log");
    await page.getByTestId("audit-log-filter-event-prefix").click();
    await page.getByTestId("audit-log-filter-event-prefix-user:").click();
    const filtered = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(filtered).toHaveCount(2);

    // The URL should carry the filter so the next render can rebuild it.
    await expect(page).toHaveURL(/eventPrefix=user/);

    await page.reload();

    // Same filter applied + same narrowed list. No re-selection needed. The
    // Radix trigger shows the selected prefix text rather than a native value.
    await expect(
      page.getByTestId("audit-log-filter-event-prefix"),
    ).toContainText("user:");
    const afterReload = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(afterReload).toHaveCount(2);
  });
});

test("admin page ships styled controls", async ({ page }) => {
  await page.goto("pages/audit-log");
  await expect(page.getByTestId("audit-log-shell")).toBeVisible();

  const ui = await styledControls(page, "audit-log-shell");
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

/**
 * Counts the plugin shell's interactive controls and how many carry a
 * styling class — a count of 0 is the unstyled-component regression signal.
 */
async function styledControls(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      total: controls.length,
      styled: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
