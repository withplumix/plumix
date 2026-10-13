import { expect, test } from "@plumix/core/test/playwright";

import { islandEvents, recordIslandEvents } from "./support/island-events.js";

test.describe("islands", () => {
  test.beforeEach(async ({ page }) => {
    await recordIslandEvents(page);
  });

  test("registers <plumix-island> and the five strategies on window.Plumix", async ({
    page,
  }) => {
    await page.goto("/islands");
    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");

    const registered = await page.evaluate(() => ({
      element: customElements.get("plumix-island") !== undefined,
      strategies: Object.keys(window.Plumix ?? {}).sort(),
    }));

    expect(registered).toEqual({
      element: true,
      strategies: ["idle", "interaction", "load", "only", "visible"],
    });
  });

  test("a load island hydrates with its props", async ({ page }) => {
    await page.goto("/islands");

    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
    await expect(page.getByTestId("load-probe-label")).toHaveText("hello");
  });

  test("an island renders its server slot children", async ({ page }) => {
    await page.goto("/islands");

    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
    await expect(page.getByTestId("load-probe-slot")).toHaveText(
      "server child",
    );
  });

  test("changing the props attribute re-renders the island", async ({
    page,
  }) => {
    await page.goto("/islands");
    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");

    await page.evaluate(() => {
      document
        .querySelector('[data-testid="load-probe"]')
        ?.closest("plumix-island")
        ?.setAttribute("props", '{"label":[0,"second"]}');
    });

    await expect(page.getByTestId("load-probe-label")).toHaveText("second");
  });

  test("removing a hydrated island dispatches plumix:unmount", async ({
    page,
  }) => {
    await page.goto("/islands");
    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");

    await page.evaluate(() => {
      document
        .querySelector('[data-testid="load-probe"]')
        ?.closest("plumix-island")
        ?.remove();
    });

    expect(await islandEvents(page)).toEqual([
      { type: "plumix:unmount", exportName: "LoadProbe", message: null },
    ]);
  });

  test("removing an unhydrated island dispatches nothing", async ({ page }) => {
    await page.goto("/islands");
    // The `load` island hydrating means the runtime has started every island.
    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
    await expect(page.getByTestId("dormant-probe")).not.toHaveAttribute(
      "data-live",
    );

    await page.evaluate(() => {
      document
        .querySelector('[data-testid="dormant-probe"]')
        ?.closest("plumix-island")
        ?.remove();
    });

    expect(await islandEvents(page)).toEqual([]);
  });

  test("an island naming an unknown strategy surfaces a hydration error", async ({
    page,
  }) => {
    await page.goto("/islands-raw");

    await expect
      .poll(() => islandEvents(page))
      .toEqual([
        {
          type: "plumix:hydration-error",
          exportName: "LoadProbe",
          message: "unknown strategy: unknown",
        },
      ]);
  });

  test("an await-children island waits for ssr-complete", async ({ page }) => {
    await page.goto("/islands-raw");
    // The unknown-strategy island failing means the runtime has started every
    // island on the page.
    await expect.poll(() => islandEvents(page)).toHaveLength(1);
    await expect(page.getByTestId("load-probe")).toHaveCount(0);

    await page.evaluate(() => {
      document
        .querySelector("plumix-island[await-children]")
        ?.setAttribute("ssr-complete", "");
    });

    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
  });

  test("an island whose chunk never loads surfaces a hydration error", async ({
    page,
  }) => {
    await page.route("**/islands/load-probe.ts*", (route) => route.abort());
    await page.goto("/islands");

    // The element retries once, a second later, before it gives up.
    await expect
      .poll(() => islandEvents(page))
      .toContainEqual(
        expect.objectContaining({
          type: "plumix:hydration-error",
          exportName: "LoadProbe",
        }),
      );
    await expect(page.getByTestId("load-probe")).not.toHaveAttribute(
      "data-live",
    );
  });

  test("hydrating every fixture island raises no dev badge", async ({
    page,
  }) => {
    await page.goto("/islands");
    await expect(page.getByTestId("load-probe")).toHaveAttribute("data-live");
    await expect(page.getByTestId("client-only-probe")).toHaveAttribute(
      "data-live",
    );

    expect(await islandEvents(page)).toEqual([]);
    await expect(page.getByTestId("plumix-island-overlay-badge")).toHaveCount(
      0,
    );
  });
});
