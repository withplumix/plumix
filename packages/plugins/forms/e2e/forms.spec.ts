// Worker-driven plugin e2e. Runs against the real forms playground at
// `../playground` via `plumix dev`, whose seeded `/contact` page carries
// the form block. Reserved for what an HTTP-level test structurally
// cannot reach: a real browser hydrating the island, an axe pass on the
// rendered form, and a submit made with JavaScript switched off.
//
// Controls are addressed through the `data-plumix-form-*` attributes the
// plugin documents as public API — the markup's stable handles, and what
// a site styling the form already selects on.

import type { Page } from "@playwright/test";
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
const ROW = "[data-plumix-form-row]";
const ADD_ROW = "[data-plumix-form-row-add='attendees']";
const removeRow = (row: string) => `[data-plumix-form-row-remove='${row}']`;

// The playground's second form: the same field list, broken into three
// steps, with a question on the last one that a plan chosen on the one
// before it reveals.
const SURVEY_ENHANCED =
  "[data-plumix-form='survey'][data-plumix-form-enhanced]";
const STEP_TITLE = "[data-plumix-form-step-title]";
const NEXT = "[data-plumix-form-next]";

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

  test("adds a row, and removing one leaves its neighbour's answer alone", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(ENHANCED)).toBeVisible();
    await page.waitForTimeout(1200);

    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "ada@example.test");

    await page.fill(control("attendees[0][who]"), "Grace");
    await page.click(ADD_ROW);
    await expect(page.locator(ROW)).toHaveCount(2);
    await page.fill(control("attendees[1][who]"), "Alan");

    // The row that stays keeps its own answer as it is renumbered into
    // the slot the removed one held — which is what the stable row key
    // buys, and what an index-keyed row would get wrong.
    await page.click(removeRow("attendees[0]"));
    await expect(page.locator(ROW)).toHaveCount(1);
    await expect(page.locator(control("attendees[0][who]"))).toHaveValue(
      "Alan",
    );
    // The button that was clicked has gone with its row, so focus has to
    // land somewhere a keyboard visitor can carry on from.
    await expect(page.locator(ADD_ROW)).toBeFocused();

    await page.click("[data-plumix-form-submit]");
    await expect(page.locator(CONFIRMATION)).toBeVisible();
  });

  test("stops offering rows at the maximum the repeater takes", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(ENHANCED)).toBeVisible();

    await page.click(ADD_ROW);
    await page.click(ADD_ROW);

    await expect(page.locator(ROW)).toHaveCount(3);
    await expect(page.locator(ADD_ROW)).toHaveCount(0);
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

test.describe("a form broken into steps, with JavaScript", () => {
  // Waiting on the enhanced marker is what keeps a spec from racing
  // hydration and clicking a button the browser would still submit the
  // plain way.
  async function openSurvey(page: Page): Promise<void> {
    await page.goto("/survey");
    await expect(page.locator(SURVEY_ENHANCED)).toBeVisible();
  }

  // Fills the first step and moves on. The wizard is the same markup
  // the plain form is, so everything here is addressed the same way.
  async function reachThePlanStep(page: Page): Promise<void> {
    await openSurvey(page);
    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "ada@example.test");
    await page.click(NEXT);
  }

  test("shows one step at a time, and takes focus to each new heading", async ({
    page,
  }) => {
    await openSurvey(page);

    await expect(page.locator(STEP_TITLE)).toHaveText("About you");
    await expect(page.locator(control("plan"))).toHaveCount(0);

    await reachThePlanStep(page);

    await expect(page.locator(STEP_TITLE)).toHaveText("Your plan");
    await expect(page.locator(STEP_TITLE)).toBeFocused();
    await expect(page.locator(control("name"))).toHaveCount(0);
    // The title a page break gave its step, in the progress indicator,
    // with the step on screen marked.
    await expect(
      page.locator("[data-plumix-form-step-marker='1'][aria-current='step']"),
    ).toHaveText("Your plan");
  });

  test("reports no accessibility violations on a step of its own", async ({
    page,
  }) => {
    await reachThePlanStep(page);

    await expectFormHasNoAxeViolations(page);
  });

  test("keeps the visitor on a step it cannot accept the answers to", async ({
    page,
  }) => {
    await openSurvey(page);

    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "not-an-address");
    await page.click(NEXT);

    await expect(page.locator(SUMMARY)).toBeVisible();
    await expect(
      page.locator("[data-plumix-form-error='email']"),
    ).toBeVisible();
    await expect(page.locator(STEP_TITLE)).toHaveText("About you");
  });

  test("comes back to the step it was on, with the answers behind it", async ({
    page,
  }) => {
    await reachThePlanStep(page);
    await page.reload();

    await expect(page.locator(SURVEY_ENHANCED)).toBeVisible();
    await expect(page.locator(STEP_TITLE)).toHaveText("Your plan");

    await page.click("[data-plumix-form-back]");
    await expect(page.locator(control("name"))).toHaveValue("Ada Lovelace");
  });

  test("asks a question the plan chosen a step earlier calls for, and stores the lot", async ({
    page,
  }) => {
    await reachThePlanStep(page);
    // Past the timing floor, so the submission is not filed as spam.
    await page.waitForTimeout(1200);

    await page.selectOption(control("plan"), "pro");
    await page.click(NEXT);

    // Declared on the last step, conditioned on a driver two steps back.
    await expect(page.locator(control("seats"))).toBeVisible();
    await page.fill(control("seats"), "12");
    await page.click("[data-plumix-form-submit]");

    await expect(page.locator(CONFIRMATION)).toBeVisible();
  });

  test("leaves out a question the plan chosen a step earlier does not call for", async ({
    page,
  }) => {
    await reachThePlanStep(page);

    await page.selectOption(control("plan"), "basic");
    await page.click(NEXT);

    await expect(page.locator(control("notes"))).toBeVisible();
    await expect(page.locator(control("seats"))).toHaveCount(0);
  });
});

test.describe("a step that only some answers call for", () => {
  const GATED = "[data-plumix-form='gated'][data-plumix-form-enhanced]";
  const SUBMIT = "[data-plumix-form-submit]";

  // The form is one step until `pro` is chosen and two once it is, so
  // the button on the first step changes what it is as the visitor
  // answers. It has to say which of the two it is at every moment: a
  // "Next" that posted the form, or a "Submit" that paged on instead,
  // would both be the button lying about what pressing it does.
  test("keeps the button honest as the answer that shapes the wizard changes", async ({
    page,
  }) => {
    await page.goto("/gated");
    await expect(page.locator(GATED)).toBeVisible();

    // Nothing chosen: the second step holds nothing, so this is a
    // one-step form and the only button submits it.
    await expect(page.locator(SUBMIT)).toBeVisible();
    await expect(page.locator("[data-plumix-form-steps]")).toHaveCount(0);

    await page.selectOption(control("plan"), "pro");

    // A second step exists now, so the same button moves on to it.
    await expect(page.locator(NEXT)).toBeVisible();
    await expect(page.locator(SUBMIT)).toHaveCount(0);
    await page.click(NEXT);
    await expect(page.locator(control("seats"))).toBeVisible();

    // And back the other way: the step goes, and so does the Next.
    await page.click("[data-plumix-form-back]");
    await page.selectOption(control("plan"), "basic");
    await expect(page.locator(SUBMIT)).toBeVisible();
    await expect(page.locator(NEXT)).toHaveCount(0);
  });

  test("keeps what a refused step was answered with", async ({ page }) => {
    await page.goto("/survey");
    await expect(page.locator(SURVEY_ENHANCED)).toBeVisible();

    // `name` is required, so this step is refused — and the answer that
    // was given has to survive the reload the visitor may well make.
    await page.fill(control("email"), "ada@example.test");
    await page.click(NEXT);
    await expect(page.locator(SUMMARY)).toBeVisible();

    await page.reload();
    await expect(page.locator(SURVEY_ENHANCED)).toBeVisible();
    await expect(page.locator(control("email"))).toHaveValue(
      "ada@example.test",
    );
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

  test("renders a form broken into steps as one form, and submits it in one go", async ({
    page,
  }) => {
    await page.goto("/survey");

    // No stepper, no way to page: every step's fields at once, which is
    // what makes the wizard an enhancement rather than a requirement.
    await expect(page.locator("[data-plumix-form-steps]")).toHaveCount(0);
    await expect(page.locator(NEXT)).toHaveCount(0);
    await expect(page.locator(control("name"))).toBeVisible();
    await expect(page.locator(control("plan"))).toBeVisible();
    await expect(page.locator(control("notes"))).toBeVisible();

    await page.fill(control("name"), "Grace Hopper");
    await page.fill(control("email"), "grace@example.test");
    await Promise.all([
      page.waitForURL("**/survey"),
      page.click("[data-plumix-form-submit]"),
    ]);

    await expect(page.locator("[data-plumix-form='survey']")).toBeVisible();
  });

  test("offers no row to add or remove, since there is nothing behind either", async ({
    page,
  }) => {
    await page.goto("/contact");

    await expect(page.locator(ROW)).toHaveCount(1);
    await expect(page.locator(ADD_ROW)).toHaveCount(0);
    await expect(page.locator("[data-plumix-form-row-remove]")).toHaveCount(0);
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

// The plugin's two theme-facing surfaces, both on the playground's own
// theme: a form the template renders itself, and a subscribe bar that is
// the theme's markup end to end. Between them they are the answer to
// "the block is not what I want" that is not a fork.
test.describe("a theme rendering the form itself", () => {
  test("renders a form the page carries no block for", async ({ page }) => {
    await page.goto("/templated");

    // The seeded entry holds no blocks at all, so this form is on the
    // page because the template asked for it by slug.
    await expect(page.locator(ENHANCED)).toBeVisible();
    await expect(
      page.locator("[data-plumix-form-control='name']"),
    ).toHaveAttribute("id", "plumix-form-templated-name");
  });

  test("submits it the way the block's own render does", async ({ page }) => {
    await page.goto("/templated");
    await expect(page.locator(ENHANCED)).toBeVisible();
    await page.waitForTimeout(1200);

    await page.fill(control("name"), "Ada Lovelace");
    await page.fill(control("email"), "ada@example.test");
    await page.click("[data-plumix-form-submit]");

    await expect(page.locator(CONFIRMATION)).toBeVisible();
  });
});

test.describe("a theme rendering its own controls", () => {
  const BAR = "[data-testid='subscribe-bar']";
  // The bar's server render is on the page before the island driving it
  // has hydrated, so a click before this lands on nothing. It carries
  // none of the plugin's markup, so the marker it is waited on by is the
  // theme's own — see `playground/subscribe-bar.ts`.
  const LIVE = "[data-testid='subscribe-bar'][data-live]";

  test("submits through usePlumixForm, in the theme's own markup", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(LIVE)).toBeVisible();
    // Nothing about the bar is the plugin's: no form element, no
    // `plumix-form-*` handle, no stylesheet of ours behind it.
    await expect(page.locator(`${BAR} [class*='plumix-form']`)).toHaveCount(0);
    // Past the timing floor, which is where a real visitor is by the
    // time they have typed an address.
    await page.waitForTimeout(1200);

    await page.fill("[data-testid='subscribe-email']", "ada@example.test");
    await page.click("[data-testid='subscribe-send']");

    await expect(page.locator("[data-testid='subscribed']")).toBeVisible();
  });

  test("renders the endpoint's refusal against the field that produced it", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator(LIVE)).toBeVisible();

    await page.fill("[data-testid='subscribe-email']", "not-an-address");
    await page.click("[data-testid='subscribe-send']");

    await expect(page.locator("[data-testid='subscribe-error']")).toBeVisible();
    await expect(page.locator("[data-testid='subscribed']")).toHaveCount(0);
  });
});

// The one thing no HTTP-level test can reach: whether a widget actually
// ends up in the form the island took over. It is drawn explicitly for
// exactly that reason — Cloudflare's own auto-scan runs once at script
// load, and an island replaces the markup the server sent — so this is
// the test that says the wiring holds.
test.describe("a form guarded by Turnstile", () => {
  const GUARDED = "[data-plumix-form='guarded'][data-plumix-form-enhanced]";
  const CHALLENGE = "input[name='cf-turnstile-response']";

  // A stand-in for Cloudflare's `api.js`. The real one is a network
  // dependency this suite should not take, and what needs proving is
  // this plugin's half: that the script is asked for at all, that the
  // container it is handed is the one still on the page after the island
  // mounted, and that the answer it writes posts under the name the
  // submit handler reads.
  async function stubWidget(page: Page): Promise<void> {
    await page.route("**/turnstile/v0/api.js*", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `window.turnstile = {
          render: (container, options) => {
            const answer = document.createElement("input");
            answer.type = "hidden";
            answer.name = options["response-field-name"];
            answer.value = "stub-challenge";
            container.append(answer);
            return "widget-1";
          },
          reset: () => undefined,
          remove: () => undefined,
        };`,
      }),
    );
  }

  // Only the drawing: verifying a challenge is the server's half, and
  // driving it from here would put a live call to Cloudflare in the
  // suite for something the dispatcher tests already cover offline.
  test("draws the challenge into the form the island took over", async ({
    page,
  }) => {
    await stubWidget(page);

    await page.goto("/guarded");

    await expect(page.locator(GUARDED)).toBeVisible();
    await expect(page.locator(`${GUARDED} ${CHALLENGE}`)).toHaveValue(
      "stub-challenge",
    );
  });

  // Turnstile is drawn by a script, so a guarded form is the one place
  // the plugin's no-JavaScript path stops. Say so rather than leaving
  // the visitor at an empty box.
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("says the form needs JavaScript, where the challenge would be", async ({
      page,
    }) => {
      await page.goto("/guarded");

      await expect(page.locator("[data-plumix-form-captcha]")).toBeVisible();
      // Read off the document rather than through a locator: a
      // `<noscript>` is parsed as text with scripting off, so there is
      // no element inside it for one to resolve to.
      expect(await page.content()).toContain("needs JavaScript enabled");
    });
  });
});
