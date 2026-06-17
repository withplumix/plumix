import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seeded by globalSetup (see e2e/globalSetup.ts). The specs are read-only
// against the database — they only drive the admin UI.
interface Fixtures {
  readonly pendingId: number;
  readonly bulkEntryId: number;
  readonly bulkIds: number[];
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

// The public render of an approved comment is covered in-process by the
// dispatcher-harness render tests (plumix dev serves the admin SPA for
// public routes). This suite exercises the admin moderation queue.
test("moderator approves a pending comment from the queue", async ({
  page,
}) => {
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

// Regression for two failures that shipped together: (1) the plugin admin
// page rendered as bare unstyled HTML (the component had zero `className`),
// and (2) the plugin CSS sidecar re-emitted base utilities into the shared
// cascade layer, loaded after the admin stylesheet, and collapsed the
// admin sidebar to `display:none`. Guards: the sidebar stays visible AND
// the page ships visibly-styled controls. See packages/admin/src/styles/
// globals.css + packages/plumix/src/vite/admin-plugin-bundle.ts.
test("admin page renders styled with the sidebar intact", async ({ page }) => {
  await page.goto("pages/comments");
  await expect(page.getByTestId("comments-shell")).toBeVisible();

  const ui = await styledChrome(page, "comments-shell");
  expect(ui.sidebarVisible).toBe(true);
  expect(ui.totalControls).toBeGreaterThan(0);
  expect(ui.styledControls).toBeGreaterThan(0);
});

// Returns whether the admin sidebar is displayed, and how many of the
// plugin shell's own interactive controls carry styling classes. The
// unstyled-page bug was literally zero `className` in the component, so a
// styled-control count of 0 is the regression signal; the sidebar-display
// check guards the CSS-sidecar cascade collapse.
async function styledChrome(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      sidebarVisible:
        sidebar !== null && getComputedStyle(sidebar).display !== "none",
      totalControls: controls.length,
      styledControls: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
