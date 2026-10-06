// The playground theme opts into native view transitions, and core's head
// script adds the navigation's direction to each one. The init script keeps
// the view transition of every reveal (`null` when the navigation had none);
// the direction script's listener runs after it, so the test reads the live
// `types` set once that has happened.

import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

interface RevealedTransition {
  readonly types: ReadonlySet<string>;
}

interface RevealRecorder {
  readonly transitions: (RevealedTransition | null)[];
}

async function recordReveals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorder: RevealRecorder = { transitions: [] };
    Object.assign(globalThis, { __plumixReveals: recorder });
    addEventListener("pagereveal", (event) => {
      const { viewTransition } = event as unknown as {
        viewTransition: RevealedTransition | null;
      };
      recorder.transitions.push(viewTransition);
    });
  });
}

// The types of the current document's last revealed view transition, or null
// while the document has not been revealed yet, so a poll keeps waiting. A
// reveal without a transition throws here, which fails the test.
async function lastRevealTypes(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    const { transitions } = (
      globalThis as unknown as { __plumixReveals: RevealRecorder }
    ).__plumixReveals;
    const last = transitions.at(-1);
    if (last === undefined) return null;
    return [...(last as RevealedTransition).types];
  });
}

// How many reveals the current document had, and its last view transition.
async function reveals(
  page: Page,
): Promise<{ count: number; last: RevealedTransition | null | undefined }> {
  return page.evaluate(() => {
    const { transitions } = (
      globalThis as unknown as { __plumixReveals: RevealRecorder }
    ).__plumixReveals;
    return { count: transitions.length, last: transitions.at(-1) };
  });
}

test.describe("@plumix/plugin-blog — view transition direction", () => {
  test("a link click reveals nav-forward, the back button nav-back", async ({
    page,
  }) => {
    await recordReveals(page);
    await page.goto("/");

    await page.getByTestId("post-link-first").click();
    await expect(page.getByTestId("post-title")).toHaveText("First post");
    await expect.poll(() => lastRevealTypes(page)).toEqual(["nav-forward"]);

    await page.goBack();
    await expect(page.getByTestId("post-link-first")).toBeVisible();
    await expect.poll(() => lastRevealTypes(page)).toEqual(["nav-back"]);
  });

  test("with reduced motion, a link click starts no view transition", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordReveals(page);
    await page.goto("/");

    await page.getByTestId("post-link-first").click();
    await expect(page.getByTestId("post-title")).toHaveText("First post");
    await expect.poll(() => reveals(page)).toEqual({ count: 1, last: null });
  });
});
