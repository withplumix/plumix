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
