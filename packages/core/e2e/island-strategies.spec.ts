import type { Page } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

/**
 * The above-the-fold `visible` island hydrating means the runtime has loaded
 * and every island on the page has registered its strategy.
 */
async function gotoStrategies(page: Page): Promise<void> {
  await page.goto("/strategies");
  await expect(page.getByTestId("visible-above")).toHaveAttribute("data-live");
}

/** Holds every request for `pattern` until the returned release is called. */
async function holdRequests(page: Page, pattern: string): Promise<() => void> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

test.describe("island loading strategies", () => {
  test("an idle island hydrates without interaction", async ({ page }) => {
    await page.goto("/strategies");

    await expect(page.getByTestId("idle-probe")).toHaveAttribute("data-live");
  });

  test("an idle island hydrates where requestIdleCallback is missing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "requestIdleCallback");
    });
    await page.goto("/strategies");

    await expect(page.getByTestId("idle-probe")).toHaveAttribute("data-live");
  });

  test("a visible island above the fold hydrates without scrolling", async ({
    page,
  }) => {
    await page.goto("/strategies");

    await expect(page.getByTestId("visible-above")).toHaveAttribute(
      "data-live",
    );
  });

  test("a visible island below the fold hydrates once scrolled into view", async ({
    page,
  }) => {
    await gotoStrategies(page);
    await expect(page.getByTestId("visible-below")).not.toHaveAttribute(
      "data-live",
    );

    await page.getByTestId("visible-below").scrollIntoViewIfNeeded();

    await expect(page.getByTestId("visible-below")).toHaveAttribute(
      "data-live",
    );
  });

  test("the click that hydrates an interaction island lands once", async ({
    page,
  }) => {
    await gotoStrategies(page);
    await expect(page.getByTestId("counter")).not.toHaveAttribute("data-live");

    await page.getByTestId("counter-button").click();

    await expect(page.getByTestId("counter")).toHaveAttribute("data-live");
    await expect(page.getByTestId("counter-button")).toHaveText("1");
  });

  test("a click during hover-triggered hydration is not lost", async ({
    page,
  }) => {
    const release = await holdRequests(page, "**/islands/counter.ts*");
    await gotoStrategies(page);

    await page.getByTestId("counter-button").hover();
    await page.getByTestId("counter-button").click();
    release();

    await expect(page.getByTestId("counter")).toHaveAttribute("data-live");
    await expect(page.getByTestId("counter-button")).toHaveText("1");
  });

  test("a keypress that hydrates an island reaches it with its key", async ({
    page,
  }) => {
    await gotoStrategies(page);

    await page
      .getByTestId("counter-input")
      .dispatchEvent("keydown", { key: "Enter", bubbles: true });

    await expect(page.getByTestId("counter")).toHaveAttribute("data-live");
    await expect(page.getByTestId("counter-key")).toHaveText("Enter");
  });

  test("focusing an interaction island's input leaves it focused after hydration", async ({
    page,
  }) => {
    await gotoStrategies(page);

    await page.getByTestId("counter-input").focus();

    await expect(page.getByTestId("counter")).toHaveAttribute("data-live");
    await expect(page.getByTestId("counter-input")).toBeFocused();
  });

  test("a click inside a nested interaction island hydrates that island", async ({
    page,
  }) => {
    await gotoStrategies(page);

    await page.getByTestId("nested-clicker").click();

    await expect(page.getByTestId("nested-clicker")).toHaveAttribute(
      "data-live",
    );
    await expect(page.getByTestId("nested-clicker")).toHaveText("1");
  });

  test('prefetch="visible" fetches the chunk on scroll and hydrates on click', async ({
    page,
  }) => {
    const chunkRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/islands/prefetch-probe.ts")) {
        chunkRequests.push(request.url());
      }
    });
    await gotoStrategies(page);
    expect(chunkRequests).toEqual([]);

    const prefetched = page.waitForRequest("**/islands/prefetch-probe.ts*");
    await page.getByTestId("prefetch-probe").scrollIntoViewIfNeeded();
    await prefetched;
    await expect(page.getByTestId("prefetch-probe")).not.toHaveAttribute(
      "data-live",
    );

    await page.getByTestId("prefetch-probe").click();

    await expect(page.getByTestId("prefetch-probe")).toHaveAttribute(
      "data-live",
    );
    await expect(page.getByTestId("prefetch-probe")).toHaveText("1");
  });
});
