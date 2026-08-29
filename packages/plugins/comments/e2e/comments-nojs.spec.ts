import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "plumix/test/playwright";

// Seeded by globalSetup, once per suite run. `nojsEmail` already has one
// approved comment, so the playground's default `first_time` policy
// auto-approves what this spec posts and the thread can be read back.
interface Fixtures {
  readonly nojsSlug: string;
  readonly nojsEmail: string;
}
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e-fixtures.json"), "utf8"),
) as Fixtures;

const FORM = "[data-plumix-comment-form]";
const SUMMARY = "[data-plumix-comment-summary]";
const control = (name: string) => `[data-plumix-comment-control="${name}"]`;
const SUBMIT = "[data-plumix-comment-submit]";

// Absolute, because the rig's `baseURL` is the admin SPA's own root and
// these are public pages the worker renders.
const post = (slug: string) => `/posts/${slug}`;

// The claim this plugin's form makes, made in the one place that can
// actually test it: a real browser with scripting switched off. The
// dispatcher harness synthesises the request a browser would have sent;
// here the browser sends it.
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("posts a comment and lands back on the post with it in the thread", async ({
    page,
  }) => {
    await page.goto(post(fixtures.nojsSlug));

    // Server-rendered, not drawn by the island: the form is here before
    // anything has had a chance to run.
    await expect(page.locator(FORM)).toBeVisible();

    await page.fill(control("name"), "Grace Hopper");
    await page.fill(control("email"), fixtures.nojsEmail);
    await page.fill(control("body"), "posted without a line of javascript");
    await Promise.all([
      page.waitForURL(`**/posts/${fixtures.nojsSlug}`),
      page.click(SUBMIT),
    ]);

    await expect(page.getByTestId("comments-list")).toContainText(
      "posted without a line of javascript",
    );
  });

  test("comes back as the form when the server refuses it, and the retry lands on the post", async ({
    page,
  }) => {
    await page.goto(post(fixtures.nojsSlug));

    // Spaces pass the browser's own `required` check and fail the
    // server's `trim()`, which is the only way to reach a refusal from a
    // browser with its native validation still running.
    await page.fill(control("name"), "   ");
    await page.fill(control("email"), fixtures.nojsEmail);
    await page.fill(control("body"), "a comment worth not losing");
    await page.click(SUBMIT);

    await expect(page.locator(SUMMARY)).toBeVisible();
    // The whole reason the plugin owns the markup: their words survive.
    await expect(page.locator(control("body"))).toHaveValue(
      "a comment worth not losing",
    );

    // The document is the endpoint now, so the form's own hidden field —
    // not the browser's `Referer` — is what sends the retry back to the
    // post rather than 404ing on a GET of a POST-only route.
    await page.fill(control("name"), "Grace Hopper");
    await Promise.all([
      page.waitForURL(`**/posts/${fixtures.nojsSlug}`),
      page.click(SUBMIT),
    ]);
    await expect(page.getByTestId("comments-list")).toContainText(
      "a comment worth not losing",
    );
  });
});
