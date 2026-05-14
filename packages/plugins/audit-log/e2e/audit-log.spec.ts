// Worker-driven plugin e2e (#253 / #250). Runs against the real
// audit-log playground at `../playground` via `plumix dev`, seeded by
// globalSetup with an admin user + storageState carrying the session
// cookie. No RPC mocking — the spec exercises the audit-log plugin
// end-to-end through the actual oRPC + D1 round-trip.

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openPlaygroundDb } from "plumix/test/playwright";

// Seed audit_log rows directly via D1. Audit-log hooks only fire when
// the worker handles an action through the request pipeline; for e2e
// rendering coverage we go around them with raw SQL so the table has
// something to render + filter against without depending on
// additional admin UI flows that aren't this plugin's responsibility.
// The hook→record path is exercised by `hooks.test.ts` against an
// in-memory db.
async function seedAuditRows(): Promise<void> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const stmt = `INSERT INTO audit_log (event, subject_type, subject_id, subject_label, actor_id, actor_label, properties) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const seeds: readonly (readonly [string, string, string, string])[] = [
    ["user:created", "user", "2", "alpha@example.test"],
    ["user:updated", "user", "2", "alpha@example.test"],
    ["entry:published", "entry", "10", "Hello world"],
  ];
  for (const [event, subjectType, subjectId, subjectLabel] of seeds) {
    await db.$client.execute({
      sql: stmt,
      args: [
        event,
        subjectType,
        subjectId,
        subjectLabel,
        1,
        "user-1@example.test",
        "{}",
      ],
    });
  }
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

    await page
      .getByTestId("audit-log-filter-event-prefix")
      .selectOption("user:");

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
    await page
      .getByTestId("audit-log-filter-event-prefix")
      .selectOption("user:");
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
});
