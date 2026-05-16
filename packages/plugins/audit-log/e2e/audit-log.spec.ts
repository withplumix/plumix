// Worker-driven plugin e2e (#253 / #250). Runs against the real
// audit-log playground at `../playground` via `plumix dev`, seeded by
// globalSetup with an admin user + storageState carrying the session
// cookie. No RPC mocking — the spec exercises the audit-log plugin
// end-to-end through the actual oRPC + D1 round-trip.

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/libsql";
import { openPlaygroundDb } from "plumix/test/playwright";

// Import the schema via the relative source path, not the
// `@plumix/plugin-audit-log/schema` package-export. The export points
// at `./dist/db/schema` which doesn't exist when CI runs lint (turbo
// `^build` builds upstream deps but never builds the package being
// linted), so the import would resolve to nothing and trip
// `no-unsafe-assignment`. The source path always exists.
import { auditLog } from "../src/db/schema.js";

// Seed audit_log rows directly via D1. Audit-log hooks only fire when
// the worker handles an action through the request pipeline; for e2e
// rendering coverage we go around them so the table has something to
// render + filter against without depending on additional admin UI
// flows that aren't this plugin's responsibility. The hook→record
// path is exercised by `hooks.test.ts` against an in-memory db.
//
// Insert through drizzle's typed builder against the audit-log
// plugin's own schema so column renames / new NOT NULL fields surface
// as a TypeScript error here, not a runtime SqliteError mid-test.
async function seedAuditRows(): Promise<void> {
  const playgroundDb = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const db = drizzle(playgroundDb.$client, {
    schema: { auditLog },
    casing: "snake_case",
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

  test("filter state survives a page reload via URL params", async ({
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

    // The URL should carry the filter so the next render can rebuild it.
    await expect(page).toHaveURL(/eventPrefix=user/);

    await page.reload();

    // Same filter applied + same narrowed list. No re-selection needed.
    await expect(page.getByTestId("audit-log-filter-event-prefix")).toHaveValue(
      "user:",
    );
    const afterReload = page
      .getByTestId("audit-log-table")
      .locator("[data-testid^='audit-log-row-']");
    await expect(afterReload).toHaveCount(2);
  });
});
