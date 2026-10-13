import { expect, test } from "@plumix/core/test/playwright";

import { islandEvents, recordIslandEvents } from "./support/island-events.js";

test.describe("nested islands", () => {
  test.beforeEach(async ({ page }) => {
    await recordIslandEvents(page);
  });

  test("a nested island hydrates after its parent", async ({ page }) => {
    let releaseParent = (): void => undefined;
    const parentHeld = new Promise<void>((resolve) => {
      releaseParent = resolve;
    });
    await page.route("**/islands/nest-parent.ts*", async (route) => {
      await parentHeld;
      await route.continue();
    });
    await page.goto("/islands-nested");
    // The bystander shares the nested island's chunk, so once it is live a
    // nested island free to hydrate would be live too.
    await expect(page.getByTestId("bystander")).toHaveAttribute("data-live");
    await expect(page.getByTestId("nested-child")).not.toHaveAttribute(
      "data-live",
    );

    releaseParent();

    await expect(page.getByTestId("nest-parent")).toHaveAttribute("data-live");
    await expect(page.getByTestId("nested-child")).toHaveAttribute("data-live");
  });

  test("the parent leaves a nested island's slot alone", async ({ page }) => {
    await page.goto("/islands-nested");

    await expect(page.getByTestId("nest-parent")).toHaveAttribute(
      "data-slot-html",
      '<em data-testid="parent-slot">parent slot</em>',
    );
    await expect(page.getByTestId("nested-child")).toHaveAttribute("data-live");
    await expect(page.getByTestId("nested-slot")).toHaveText("nested slot");
  });

  test("a parent that drops a hydrated child unmounts it cleanly", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/islands-nested");
    await expect(page.getByTestId("drop-parent")).toHaveAttribute("data-live");
    await expect(page.getByTestId("drop-child")).toHaveAttribute("data-live");

    await page.getByTestId("drop-parent-button").click();

    await expect(page.getByTestId("drop-child")).toHaveCount(0);
    await expect
      .poll(() => islandEvents(page))
      .toContainEqual({
        type: "plumix:unmount",
        exportName: "Probe",
        message: null,
      });
    expect(consoleErrors).toEqual([]);
  });

  test("a diverging parent flags only itself", async ({ page }) => {
    await page.goto("/islands-nested");
    await expect(page.getByTestId("diverge-parent")).toHaveAttribute(
      "data-live",
    );
    await expect(page.getByTestId("diverge-child")).toHaveAttribute(
      "data-live",
    );

    const mismatches = (await islandEvents(page)).filter(
      (event) => event.type === "plumix:island-hydration-mismatch",
    );
    expect(mismatches).toEqual([
      {
        type: "plumix:island-hydration-mismatch",
        exportName: "DivergeParent",
        message: null,
      },
    ]);
  });
});
