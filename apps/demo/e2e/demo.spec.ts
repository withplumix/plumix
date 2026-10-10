// No globalSetup / storageState: the demo mints its own session at `/demo`,
// so the spec drives the same path a visitor does.

import { expect, test } from "@playwright/test";
import { CONTENT_LIST_ROWS } from "plumix/test/playwright";

const POST_TITLE = "A post I made in the demo";

/**
 * The richest seeded entry, pinned to a fixed id by the seed, so it's opened
 * directly rather than hunted in a paginated list.
 */
const SHOWCASE_ID = 200;
const SHOWCASE_SLUG = "typography-and-elements-a-theme-test-sheet";

test("visitor enters the demo, creates a post, and it persists", async ({
  page,
}) => {
  // The public showcase renders for cookieless visitors; the demo pill carries
  // the "Try the editor" CTA (it used to live in the theme header).
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
    page.locator(CONTENT_LIST_ROWS).filter({ hasText: POST_TITLE }).first(),
  ).toBeVisible();

  // With a live session, the pill swaps to the session controls — the "Try the
  // editor" CTA is the anonymous showcase's entry point only.
  await page.goto("/");
  await expect(page.getByTestId("post-card").first()).toBeVisible();
  await expect(page.getByTestId("try-editor")).toHaveCount(0);

  // Minting a credential is refused even with a live demo session.
  const blocked = await page.request.get("/_plumix/rpc/auth/apiTokens/list");
  expect(blocked.status()).toBe(403);
});

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

  // A booted editor runtime enters edit mode and renders the seeded blocks
  // tagged; a read-only render has neither.
  const canvas = page.frameLocator(CANVAS_FRAME);
  await expect(canvas.locator('[data-plumix-mode="edit"]')).toBeAttached();
  await expect(canvas.locator("[data-plumix-id]").first()).toBeVisible();

  // The host-side overlay is positioned from geometry the canvas reports over
  // the bridge, so it proves runtime and bridge are live. The rail avoids the
  // CSS-scaled canvas surface.
  await page.getByTestId("plumix-tab-layers").click();
  await page.locator("[data-testid^='layer-']").first().click();
  await expect(page.getByTestId("plumix-overlay-selected")).toBeVisible();
  await expect(page.getByTestId("plumix-selection-toolbar")).toBeVisible();

  // The demo pill must NOT float inside the editing surface.
  await expect(canvas.locator("#plumix-demo-toolbar")).toHaveCount(0);
});

// A new entry has no content, yet the canvas still needs a root to mount
// inserted blocks into.
test("a block inserted into a new post renders in the canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  await page.goto("entries/posts");
  const navigated = page.waitForURL(/\/entries\/posts\/\d+\/edit/);
  await page.getByTestId("content-list-new-button").click();
  await navigated;

  const canvas = page.frameLocator(CANVAS_FRAME);
  await expect(canvas.locator("[data-plumix-content-root]")).toBeAttached();
  await page.getByTestId("block-catalog-item-core/rich-text").click();
  await expect(
    canvas.locator('[data-plumix-block="core/rich-text"]'),
  ).toBeVisible();
});

// Regression: the site origin came from the preset's placeholder passkey
// origin, so every canonical and og:url pointed at https://demo.localhost.
test("the canonical URL points at the host the demo is served from", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  expect(new URL(canonical ?? "").origin).toBe(new URL(baseURL ?? "").origin);
});

// Author archives: the post byline links to `/authors/{slug}`, which lists that
// author's published posts. Public, cookieless — no demo session needed.
test("the author byline links to the author archive of the author's posts", async ({
  page,
}) => {
  await page.goto("/");
  // Every post card's meta line carries the author byline as a link.
  const byline = page.getByTestId("post-meta-author").first();
  await expect(byline).toBeVisible();
  await expect(byline).toHaveText("The Plumix Editors");
  await byline.click();

  // Lands on the author archive, which renders the heading + the author's
  // posts.
  await page.waitForURL(/\/authors\/the-plumix-editors/);
  await expect(page.getByTestId("post-list")).toContainText(
    "Posts by The Plumix Editors",
  );
  await expect(page.getByTestId("post-card").first()).toBeVisible();
});

// A bogus author slug 404s (parity with the other archives).
test("an unknown author slug returns 404", async ({ page }) => {
  const res = await page.request.get("/authors/nobody");
  expect(res.status()).toBe(404);
});

test("the post date links to its day archive", async ({ page }) => {
  await page.goto("/");
  // Each post card's meta line carries the published date as a link to
  // `/YYYY/MM/DD`.
  const dateLink = page.getByTestId("post-meta-date").first();
  await expect(dateLink).toBeVisible();
  const href = await dateLink.getAttribute("href");
  expect(href).toMatch(/^\/\d{4}\/\d{2}\/\d{2}$/);
  await dateLink.click();

  // Lands on the day archive, which lists posts from that day.
  await page.waitForURL(/\/\d{4}\/\d{2}\/\d{2}$/);
  await expect(page.getByTestId("post-list")).toBeVisible();
  await expect(page.getByTestId("post-card").first()).toBeVisible();
});

// An impossible date 404s (parity with the other archives).
test("an impossible date returns 404", async ({ page }) => {
  const res = await page.request.get("/2026/02/30");
  expect(res.status()).toBe(404);
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

// The theme reads `entry.images.featured`, so this passes only if the post's
// own cover row resolved through the `featured` role — the showcase's cover is
// the media row seeded as `cover-<its slug>`.
test("a post renders the cover its featured role resolves to", async ({
  page,
}) => {
  await page.goto(`/posts/${SHOWCASE_SLUG}`);
  const single = page.getByTestId("post-single");
  await expect(single.getByTestId("featured-image")).toHaveAttribute(
    "src",
    new RegExp(`cover-${SHOWCASE_SLUG}`),
  );
});

// A demo runs without `storage:`, so the picker offers no upload gesture — the
// library it opens is the per-session database's rows and nothing else.
test("the Featured-image picker offers no upload in the demo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  await page.goto(`entries/posts/${String(SHOWCASE_ID)}/edit`);
  await page.getByTestId("plumix-tab-page").click();
  await page.getByTestId("meta-box-field-featuredImage-input-open").click();

  const modal = page.getByTestId("meta-box-field-featuredImage-input-modal");
  await expect(modal.getByTestId("media-library-grid")).toBeVisible();
  await expect(modal.getByTestId("media-library-upload")).toHaveCount(0);
  await expect(modal.getByTestId("media-library-dropzone")).toHaveCount(0);
});

// Without a storage slot `media.delete` removes only the session's own row, so
// the demo serves it rather than refusing it.
test("deleting a media item from the library removes its card", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  await page.goto("pages/media");
  const card = page
    .locator(
      "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
    )
    .first();
  await expect(card).toBeVisible();
  const cardTestId = await card.getAttribute("data-testid");
  if (cardTestId === null) throw new Error("the media card has no testid");

  await card.click();
  await expect(page.getByTestId("media-detail-drawer")).toBeVisible();
  const deleted = page.waitForResponse((r) =>
    r.url().endsWith("/media/delete"),
  );
  await page.getByTestId("media-detail-delete").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await deleted).status()).toBe(200);

  await expect(page.getByTestId(cardTestId)).toHaveCount(0);
});

// The demo refuses what reaches past the visitor's sandbox (a credential, a
// real email), and the admin hides it.
test("users and the profile offer only what the demo serves, and each of it succeeds", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  await page.goto("users");
  await expect(page.getByTestId("users-list-row-2")).toBeVisible();
  await expect(page.getByTestId("users-list-invite-button")).toHaveCount(0);
  await expect(page.getByTestId("app-sidebar-nav-/users")).toBeVisible();
  await expect(page.getByTestId("app-sidebar-nav-/mailer")).toHaveCount(0);

  // Another user: rename, disable, delete.
  await page.goto("users/2/edit");
  await page.getByTestId("user-edit-name-input").fill("Renamed Contributor");
  const updated = page.waitForResponse((r) => r.url().endsWith("/user/update"));
  await page.getByTestId("user-edit-submit").click();
  expect((await updated).status()).toBe(200);
  const disabled = page.waitForResponse((r) =>
    r.url().endsWith("/user/disable"),
  );
  await page.getByTestId("user-edit-disable-button").click();
  expect((await disabled).status()).toBe(200);
  await expect(page.getByTestId("user-edit-enable-button")).toBeVisible();
  await page.getByTestId("user-edit-delete-button").click();
  const deleted = page.waitForResponse((r) => r.url().endsWith("/user/delete"));
  await page.getByTestId("user-delete-confirm-button").click();
  expect((await deleted).status()).toBe(200);
  await page.waitForURL(/\/users(\?|$)/);
  await expect(page.getByTestId("users-list-row-2")).toHaveCount(0);

  // The visitor's own profile: no credential or email-change surface.
  await page.goto("users/1/edit");
  await expect(page.getByTestId("language-card")).toBeVisible();
  await expect(page.getByTestId("profile-sessions-card")).toBeVisible();
  await expect(page.getByTestId("profile-sessions-error")).toHaveCount(0);
  await expect(page.getByTestId("profile-passkeys-card")).toHaveCount(0);
  await expect(page.getByTestId("api-tokens-card")).toHaveCount(0);
  await expect(page.getByTestId("user-edit-email-change-button")).toHaveCount(
    0,
  );

  // The demo configures one locale, so the card has nothing to switch to;
  // the procedure behind it is served all the same.
  const setLocale = await page.request.post("/_plumix/rpc/user/setLocale", {
    headers: { "x-plumix-request": "1" },
    data: { json: { code: "en" } },
  });
  expect(setLocale.status()).toBe(200);

  // Device authorization is off, so its page sends the visitor away.
  await page.goto("auth/device");
  await expect(page).not.toHaveURL(/auth\/device/);
});

test("the demo pill names what's off in the visitor's language", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);

  await page.goto(`/posts/${SHOWCASE_SLUG}`);
  await expect(page.getByTestId("demo-off")).toHaveText(
    "Off in this demo: API-Tokens, Geräteanmeldung, Passkeys, OAuth-Anmeldung und E-Mail-Versand",
  );
  await context.close();
});
