// The playground theme opts into native view transitions, and core's head
// script adds the navigation's direction to each one. The init script keeps
// the live `types` set of every revealed transition (`null` when the
// navigation had none); the direction script's listener runs after it, so the
// test reads the set once that has happened.

import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

interface RevealRecorder {
  readonly reveals: (ReadonlySet<string> | null)[];
}

async function recordReveals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorder: RevealRecorder = { reveals: [] };
    Object.assign(globalThis, { __plumixReveals: recorder });
    addEventListener("pagereveal", (event) => {
      const { viewTransition } = event as unknown as {
        viewTransition: { types: ReadonlySet<string> } | null;
      };
      recorder.reveals.push(viewTransition?.types ?? null);
    });
  });
}

// Each document's reveals, the last one's types as an array.
async function lastReveal(
  page: Page,
): Promise<{ count: number; types: string[] | null }> {
  return page.evaluate(() => {
    const { reveals } = (
      globalThis as unknown as { __plumixReveals: RevealRecorder }
    ).__plumixReveals;
    const last = reveals.at(-1) ?? null;
    return { count: reveals.length, types: last && [...last] };
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
    await expect
      .poll(async () => (await lastReveal(page)).types)
      .toEqual(["nav-forward"]);

    await page.goBack();
    await expect(page.getByTestId("post-link-first")).toBeVisible();
    await expect
      .poll(async () => (await lastReveal(page)).types)
      .toEqual(["nav-back"]);
  });

  test("with reduced motion, a link click starts no view transition", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordReveals(page);
    await page.goto("/");

    await page.getByTestId("post-link-first").click();
    await expect(page.getByTestId("post-title")).toHaveText("First post");
    await expect
      .poll(() => lastReveal(page))
      .toEqual({ count: 1, types: null });
  });
});
