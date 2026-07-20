// Full demo-sandbox funnel against the real worker (`plumix dev`) with the
// per-session Durable Object as the database. No globalSetup / storageState:
// the demo mints its own session at `/demo` and the synthetic authenticator
// provides identity, so the spec drives the same path a visitor does —
// public showcase → CTA → provision → admin → create → persist → blocked.

import { expect, test } from "@playwright/test";

// Title links carry `content-list-row-<id>`; the actions strip and trash
// button reuse the prefix, so exclude them when matching real rows.
const CONTENT_ROWS =
  "[data-testid^='content-list-row-']:not([data-testid*='-actions-']):not([data-testid*='-trash-'])";

const POST_TITLE = "A post I made in the demo";

// The seeded typography showcase — the richest seeded entry, so it's a reliable
// target for opening the editor and rendering tagged blocks. The seed pins it to
// a fixed id (`POST_BASE_ID + 0` in seed/generate.mjs), so open it directly
// rather than hunting a date-sorted, paginated list where it sits last.
const SHOWCASE_ID = 200;
const SHOWCASE_SLUG = "typography-and-elements-a-theme-test-sheet";

test("visitor enters the demo, creates a post, and it persists", async ({
  page,
}) => {
  // The public showcase renders for cookieless visitors, carrying the CTA.
  await page.goto("/");
  await expect(page.getByTestId("try-editor")).toBeVisible();
  await expect(page.getByTestId("post-card").first()).toBeVisible();

  // Clicking it lands on `/demo`, which provisions the session DO and
  // redirects into the admin (Turnstile is off, so init runs immediately).
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  // Create a post. The New button redirects to the edit URL once
  // entry.create resolves; the title autosaves via entry.update.
  await page.goto("entries/posts");
  const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
  await page.getByTestId("content-list-new-button").click();
  await navigated;

  await page.getByTestId("plumix-tab-page").click();
  await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
  const updated = page.waitForResponse(
    (r) => r.url().endsWith("/entry/update") && r.status() === 200,
  );
  await page.getByTestId("plumix-editor-title-input").fill(POST_TITLE);
  await updated;

  // Persistence proof: reload the list and the row comes back from the DO.
  await page.goto("entries/posts");
  await expect(
    page.locator(CONTENT_ROWS).filter({ hasText: POST_TITLE }).first(),
  ).toBeVisible();

  // With a live session, the public site no longer offers the "Try the
  // editor" CTA — it's the anonymous showcase's entry point only.
  await page.goto("/");
  await expect(page.getByTestId("post-card").first()).toBeVisible();
  await expect(page.getByTestId("try-editor")).toHaveCount(0);

  // A security-gated route is refused even with a live demo session.
  const blocked = await page.request.get("/_plumix/rpc/user/list");
  expect(blocked.status()).toBe(403);
});

// Regression: the visual editor was dead in the demo runtime (public renders
// authenticated only `plumix_session`, so a `plumix_demo` visitor rendered
// anonymous → no editor runtime → no bridge) and the demo pill leaked into the
// canvas. Nothing opened the editor in the real demo runtime, so nothing caught
// it — this does.
const CANVAS_FRAME = '[data-testid="plumix-canvas-frame"] iframe';

test("the visual editor boots inside the demo — blocks are selectable, no demo pill in the canvas", async ({
  page,
}) => {
  // Enter the demo (mints the session DO, redirects into the admin).
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  // Open the seeded showcase post in the editor (directly, by its pinned id).
  await page.goto(`entries/posts/${String(SHOWCASE_ID)}/edit`);
  await page.waitForURL(/\/entries\/posts\/\d+\/edit/);

  // The canvas iframe loads the entry's public route with `?plumix.edit`. If the
  // editor runtime booted (the fix), edit mode is entered and the seeded blocks
  // render tagged. Before the fix the render fell through to read-only, so no
  // `data-plumix-mode="edit"` and no tagged blocks.
  const canvas = page.frameLocator(CANVAS_FRAME);
  await expect(canvas.locator('[data-plumix-mode="edit"]')).toBeAttached();
  await expect(canvas.locator("[data-plumix-id]").first()).toBeVisible();

  // Selecting a block from the Layers tab draws the host-side overlay — which
  // is positioned from geometry the canvas reports back over the bridge. So the
  // overlay appearing proves the in-iframe editor runtime booted AND the bridge
  // is live (the whole path canEdit → runtime → bridge). Driving it from the
  // rail rather than a canvas click keeps it off the CSS-scaled canvas surface.
  await page.getByTestId("plumix-tab-layers").click();
  await page.locator("[data-testid^='layer-']").first().click();
  await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();
  await expect(page.getByTestId("plumix-selection-toolbar")).toBeVisible();

  // The demo pill must NOT float inside the editing surface.
  await expect(canvas.locator("#plumix-demo-toolbar")).toHaveCount(0);
});

// Companion guard: the demo pill still appears on an ordinary public page for a
// session holder — the fix narrows where it's suppressed, it doesn't remove it.
test("the demo pill still shows on the public site for a session holder", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  // Visit a public entry (not the admin, not the editor canvas): the pill is
  // there. Absolute path — the baseURL points at the admin mount.
  await page.goto(`/posts/${SHOWCASE_SLUG}`);
  await expect(page.locator("#plumix-demo-toolbar")).toBeVisible();
});
