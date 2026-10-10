// The direction script's listener runs after the init script, so the test
// reads the live `types` set once that has happened.

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

/**
 * Null while the document has not been revealed, so a poll keeps waiting; a
 * reveal without a transition throws, failing the test.
 */
async function lastRevealTypes(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    const { transitions } = (
      globalThis as unknown as { __plumixReveals: RevealRecorder }
    ).__plumixReveals;
    const last = transitions.at(-1);
    if (last === undefined) return null;
    if (last === null)
      throw new Error("the last reveal had no view transition");
    return [...last.types];
  });
}

/** How many reveals the current document had, and its last view transition. */
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
