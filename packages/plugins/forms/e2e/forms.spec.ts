// Worker-driven plugin e2e. Runs against the real forms playground at
// `../playground` via `plumix dev`, whose seeded `/contact` page carries
// the form block. Reserved for what an HTTP-level test structurally
// cannot reach: a real browser hydrating the island, an axe pass on the
// rendered form, and a submit made with JavaScript switched off.
//
// Controls are addressed through the `data-plumix-form-*` attributes the
// plugin documents as public API — the markup's stable handles, and what
// a site styling the form already selects on.

import { expect, test } from "plumix/test/playwright";

import { expectFormHasNoAxeViolations } from "./support/axe.js";

const FORM = "[data-plumix-form='contact']";
// The island sets this once it is driving the form. Waiting on it is
// what keeps a spec from racing hydration and clicking a button the
// browser would still submit the plain way.
const ENHANCED = "[data-plumix-form='contact'][data-plumix-form-enhanced]";
const SUMMARY = "[data-plumix-form-summary]";
const CONFIRMATION = "[data-plumix-form-confirmation]";
const control = (key: string) => `[data-plumix-form-control='${key}']`;

// A visitor is not signed in. The seeded admin session would personalize
// the render and put the site's dev chrome on the page, which is neither
// what a visitor meets nor what the edge caches.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("with JavaScript", () => {
  test("submits without leaving the page", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator(ENHANCED)).toBeVisible();
    // Past the timing floor the spam check applies, so this is the path a
    // real visitor takes rather than the one a script trips.
    await page.waitForTimeout(1200);
    // Set after load: a page reload would take it with it.
    await page.evaluate(() => {
      Object.assign(window, { __stayedPut: true });
    });

    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "ada@example.test");
    await page.click("[data-plumix-form-submit]");

    await expect(page.locator(CONFIRMATION)).toBeVisible();
    expect(await page.evaluate(() => "__stayedPut" in window)).toBe(true);
  });

  test("renders an error against the field that produced it and moves focus to the summary", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(ENHANCED)).toBeVisible();

    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "not-an-address");
    await page.click("[data-plumix-form-submit]");

    const summary = page.locator(SUMMARY);
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(
      page.locator("[data-plumix-form-error='email']"),
    ).toBeVisible();
    await expect(page.locator(control("email"))).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // What the visitor typed survives the rejection.
    await expect(page.locator(control("name"))).toHaveValue("Ada Lovelace");
  });

  test("reports no accessibility violations, before or after a failed submit", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(ENHANCED)).toBeVisible();

    await expectFormHasNoAxeViolations(page);

    await page.click("[data-plumix-form-submit]");
    await expect(page.locator(SUMMARY)).toBeVisible();
    await expectFormHasNoAxeViolations(page);
  });

  test("fetches the timing token from an endpoint nothing caches", async ({
    page,
  }) => {
    const token = page.waitForResponse("**/_plumix/forms/token");

    await page.goto("/contact");

    const response = await token;
    expect(response.headers()["cache-control"]).toBe("no-store");
    await expect(
      page.locator(`${FORM} input[name='__plumix_token']`),
    ).toHaveCount(1);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("comes back as the form when the server rejects it, and the retry lands on the page", async ({
    page,
  }) => {
    await page.goto("/contact");

    // Spaces pass the browser's own `required` check and fail the
    // server's, which is the only way to reach the rejected-submit page
    // from a browser with its native validation still running.
    await page.fill(control("name"), "   ");
    await page.fill(control("email"), "grace@example.test");
    await page.click("[data-plumix-form-submit]");

    await expect(page.locator(SUMMARY)).toBeVisible();
    await expect(page.locator("[data-plumix-form-error='name']")).toBeVisible();

    // The document is the endpoint now; the form carries the page it came
    // from so the corrected submit returns there rather than 404ing on a
    // GET of a POST-only route.
    await page.fill(control("name"), "Grace Hopper");
    await Promise.all([
      page.waitForURL("**/contact"),
      page.click("[data-plumix-form-submit]"),
    ]);
    await expect(page.locator(FORM)).toBeVisible();
  });

  test("still submits, and the page it came from carries nothing per-visitor", async ({
    page,
  }) => {
    const served = await page.goto("/contact");

    // Nothing the island adds is in the bytes the server sent: what it
    // upgrades is a form that already works, and none of those bytes are
    // about this visitor.
    const html = (await served?.text()) ?? "";
    expect(html).toContain('data-plumix-form="contact"');
    expect(html).not.toContain("__plumix_token");
    expect(html).not.toContain("data-plumix-form-enhanced");

    await page.fill(control("name"), "Grace Hopper");
    await page.fill(control("email"), "grace@example.test");
    await Promise.all([
      page.waitForURL("**/contact"),
      page.click("[data-plumix-form-submit]"),
    ]);

    // Back on the page it came from, by way of the handler's redirect —
    // a rejected submit would have left the browser on the endpoint.
    await expect(page.locator(FORM)).toBeVisible();
  });
});
