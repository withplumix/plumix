import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { inArray } from "plumix/db";
import { openPlaygroundDb } from "plumix/test/playwright";

// Relative source path, not `@plumix/plugin-comments/schema` — see the
// audit-log spec's schema import for why.
import { comments } from "../src/db/schema.js";

// Seeded by globalSetup (see e2e/globalSetup.ts), once per suite run.
interface Fixtures {
  readonly pendingId: number;
  readonly bulkEntryId: number;
  readonly bulkIds: number[];
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

// Both tests moderate their fixture, and the queue lists only what is still
// pending — so a fixture an earlier attempt approved is invisible to the
// retry (see `playground` in definePlumixE2EConfig for why it survives).
//
// Each test resets only the ids it owns. These tests are not serial and
// `fullyParallel` runs them concurrently off CI, so a reset that reached
// every fixture would un-approve a sibling's rows mid-assertion.
async function resetToPending(ids: readonly number[]): Promise<void> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  await db
    .update(comments)
    .set({ status: "pending" })
    .where(inArray(comments.id, [...ids]));
}

// The public render of an approved comment is covered in-process by the
// dispatcher-harness render tests (plumix dev serves the admin SPA for
// public routes). This suite exercises the admin moderation queue.
test("moderator approves a pending comment from the queue", async ({
  page,
}) => {
  await resetToPending([fixtures.pendingId]);
  await page.goto("pages/comments");
  await expect(page.getByTestId("comments-shell")).toBeVisible();

  const row = page.getByTestId(`comment-row-${String(fixtures.pendingId)}`);
  await expect(row).toBeVisible();

  await page
    .getByTestId(`comment-approve-${String(fixtures.pendingId)}`)
    .click();

  // It leaves the pending queue and shows under Approved.
  await expect(row).toBeHidden();
  await page.getByTestId("comments-tab-approved").click();
  await expect(
    page.getByTestId(`comment-row-${String(fixtures.pendingId)}`),
  ).toBeVisible();
});

test("moderator bulk-approves selected comments", async ({ page }) => {
  await resetToPending(fixtures.bulkIds);
  await page.goto("pages/comments");
  // Isolate this test's comments via the per-entry filter.
  await page
    .getByTestId("comments-entry-filter")
    .fill(String(fixtures.bulkEntryId));

  const [firstId, secondId] = fixtures.bulkIds;
  await expect(
    page.getByTestId(`comment-row-${String(firstId)}`),
  ).toBeVisible();

  await page.getByTestId(`comment-select-${String(firstId)}`).check();
  await page.getByTestId(`comment-select-${String(secondId)}`).check();
  await expect(page.getByTestId("comments-bulk-count")).toHaveText("2");

  await page.getByTestId("comments-bulk-approve").click();
  await expect(page.getByTestId(`comment-row-${String(firstId)}`)).toBeHidden();
  await expect(
    page.getByTestId(`comment-row-${String(secondId)}`),
  ).toBeHidden();
});

// Regression: the comments admin page once shipped as bare unstyled HTML
// (the component had zero `className`). Assert it ships styled controls.
// (The admin sidebar's CSS-cascade isolation — the other half of the
// original incident — is guarded admin-side in packages/admin/e2e/
// app-shell.spec.ts + packages/admin/src/styles/globals.test.ts.)
test("admin page ships styled controls", async ({ page }) => {
  await page.goto("pages/comments");
  await expect(page.getByTestId("comments-shell")).toBeVisible();

  const ui = await styledControls(page, "comments-shell");
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

// Counts the plugin shell's interactive controls and how many carry a
// styling class — a count of 0 is the unstyled-component regression signal.
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
