import type { Page } from "@playwright/test";

import { dragTo, expect, test } from "@plumix/core/test/playwright";

import { waitForDevClient } from "./support/dev-client.js";

/** Every island on the page hydrates on interaction, so nothing fails yet. */
async function openDevMismatch(page: Page): Promise<void> {
  await page.goto("/dev-mismatch");
  await waitForDevClient(page);
}

/** Opens the dialog on the one failing island's error. */
async function openFailingError(page: Page): Promise<void> {
  await page.getByTestId("failing-first").hover();
  await page.getByTestId("plumix-island-overlay-badge").click();
  await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeVisible();
}

test.describe("the dev island overlay", () => {
  test.beforeEach(async ({ page }) => {
    await openDevMismatch(page);
  });

  test("a failing island shows a badge that opens its error", async ({
    page,
  }) => {
    await page.getByTestId("failing-first").hover();

    await expect(
      page.getByTestId("plumix-island-overlay-badge-count"),
    ).toHaveText("1");
    await page.getByTestId("plumix-island-overlay-badge").click();
    await expect(page.getByTestId("plumix-dev-overlay-label")).toHaveText(
      "<Failing>",
    );
    await expect(page.getByTestId("plumix-dev-error-message")).toHaveText(
      "first island failed",
    );
  });

  test("shows the component stack of an island that throws", async ({
    page,
  }) => {
    // Resolved frames already name the component, so the dialog shows the
    // component stack only when the stack resolver can't answer.
    await page.route("**/@plumix-dev-error-stack", (route) => route.abort());

    await page.getByTestId("throw-on-click").click();

    await page.getByTestId("plumix-island-overlay-badge").click();
    await expect(
      page.getByTestId("plumix-dev-error-component-stack"),
    ).toContainText("ThrowOnClick");
  });

  test("shows the server-vs-client diff of a mismatched island", async ({
    page,
  }) => {
    await page.getByTestId("mismatch").hover();

    await page.getByTestId("plumix-island-overlay-badge").click();
    await expect(page.getByTestId("plumix-dev-error-name")).toHaveText(
      "Hydration mismatch",
    );
    await expect(page.getByTestId("plumix-dev-overlay-label")).toHaveText(
      "<Mismatch>",
    );
    await expect(
      page.getByTestId("plumix-dev-error-hydration-server"),
    ).toContainText("SERVER");
    await expect(
      page.getByTestId("plumix-dev-error-hydration-client"),
    ).toContainText("CLIENT");
  });

  test("a suppressHydrationWarning node raises no badge", async ({ page }) => {
    await page.getByTestId("suppressed").hover();
    await expect(page.getByTestId("suppressed")).toHaveAttribute("data-live");

    // A mismatch after it is the only error the badge counts.
    await page.getByTestId("mismatch").hover();

    await expect(
      page.getByTestId("plumix-island-overlay-badge-count"),
    ).toHaveText("1");
    await expect(page.getByTestId("suppressed")).toHaveText("SERVER");
  });

  test("two failing islands count 2 and the dialog steps between them", async ({
    page,
  }) => {
    await page.getByTestId("failing-first").hover();
    await page.getByTestId("failing-second").hover();
    await expect(
      page.getByTestId("plumix-island-overlay-badge-count"),
    ).toHaveText("2");
    await page.getByTestId("plumix-island-overlay-badge").click();
    await expect(page.getByTestId("plumix-island-overlay-count")).toHaveText(
      "1 / 2",
    );
    await expect(page.getByTestId("plumix-dev-error-message")).toHaveText(
      "second island failed",
    );

    await page.getByTestId("plumix-island-overlay-next").click();
    await expect(page.getByTestId("plumix-island-overlay-count")).toHaveText(
      "2 / 2",
    );
    await expect(page.getByTestId("plumix-dev-error-message")).toHaveText(
      "first island failed",
    );

    await page.getByTestId("plumix-island-overlay-prev").click();
    await expect(page.getByTestId("plumix-dev-error-message")).toHaveText(
      "second island failed",
    );
  });

  test("a backdrop click closes the dialog to the badge", async ({ page }) => {
    await openFailingError(page);

    await page
      .getByTestId("plumix-dev-overlay-backdrop")
      .click({ position: { x: 5, y: 5 } });

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeHidden();
    await expect(page.getByTestId("plumix-island-overlay-badge")).toBeVisible();
  });

  test("a drag from the dialog onto the backdrop leaves it open", async ({
    page,
  }) => {
    await openFailingError(page);

    await dragTo(
      page,
      page.getByTestId("plumix-dev-error-message"),
      page.getByTestId("plumix-dev-overlay-backdrop"),
      { targetPosition: () => ({ x: 5, y: 5 }) },
    );

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeVisible();
  });

  test("the close button closes the dialog to the badge", async ({ page }) => {
    await openFailingError(page);

    await page.getByTestId("plumix-dev-overlay-close").click();

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeHidden();
    await expect(page.getByTestId("plumix-island-overlay-badge")).toBeVisible();
  });

  test("Escape closes the dialog to the badge", async ({ page }) => {
    await openFailingError(page);

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeHidden();
    await expect(page.getByTestId("plumix-island-overlay-badge")).toBeVisible();
  });

  test("the error shows source frames for the island file", async ({
    page,
  }) => {
    await openFailingError(page);

    await expect(
      page.getByTestId("plumix-dev-error-frame").first(),
    ).toHaveAttribute("data-file", /\/playground\/islands\/dev-faults\.ts$/);
  });
});
