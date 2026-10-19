// The playground configures no S3 credentials, so uploads PUT to the worker's
// same-origin route and no storage mock is needed.

import type { Page } from "@playwright/test";
import { expect, PNG_1X1, test } from "plumix/test/playwright";

test.describe.serial("@plumix/plugin-media — worker-driven happy path", () => {
  test("empty state → upload → card visible → delete → empty again", async ({
    page,
  }) => {
    // 1. Empty library renders the dropzone affordance against a fresh
    //    worker.
    await page.goto("pages/media");
    await expect(page.getByTestId("media-library")).toBeVisible();
    await expect(page.getByTestId("media-library-title")).toHaveText(
      "Media Library",
    );
    await expect(page.getByTestId("media-library-dropzone")).toBeVisible();
    await expect(page.getByTestId("media-library-dropzone")).toContainText(
      "library is empty",
    );

    // `confirm` validates the bytes against the declared MIME, so this is a
    // real PNG (signature, IHDR, IDAT, IEND) or confirm answers 409.
    const fileInput = page.locator(
      '[data-testid="media-library-upload"] input[type="file"]',
    );
    // Wait for the confirm round-trip explicitly so the assertion
    // below doesn't race the list query's refetch.
    const confirmed = page.waitForResponse(
      (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
    );
    await fileInput.setInputFiles({
      name: "smoke.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await confirmed;

    // After upload + confirm, a single card shows up. The card
    // testid `media-card-<id>` carries server-assigned ids; the
    // `:not(...)` filter excludes the per-card title/delete inner
    // elements that share the testid prefix.
    const cards = page.locator(
      "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
    );
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("smoke.png");

    // 3. Delete via the detail drawer: click the card to open the
    //    drawer, click Delete, confirm. The card-level delete button
    //    moved to the drawer when the WP-style card-is-index pattern
    //    landed.
    await cards.first().click();
    await expect(page.getByTestId("media-detail-drawer")).toBeVisible();
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith("/media/delete") && r.status() === 200,
    );
    await page.getByTestId("media-detail-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleted;

    await expect(cards).toHaveCount(0);
    await expect(page.getByTestId("media-library-dropzone")).toBeVisible();
  });

  test("a file dropped on the library uploads it", async ({ page }) => {
    await page.goto("pages/media");
    const library = page.getByTestId("media-library");
    await expect(page.getByTestId("media-library-dropzone")).toBeVisible();

    const dataTransfer = await page.evaluateHandle(
      (bytes) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "dropped.png", {
            type: "image/png",
          }),
        );
        return transfer;
      },
      [...PNG_1X1],
    );
    const confirmed = page.waitForResponse(
      (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
    );
    await library.dispatchEvent("drop", { dataTransfer });
    await confirmed;

    const cards = page.locator(
      "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
    );
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("dropped.png");

    // Serial suite: leave the library empty for the next case.
    await cards.first().click();
    await expect(page.getByTestId("media-detail-drawer")).toBeVisible();
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith("/media/delete") && r.status() === 200,
    );
    await page.getByTestId("media-detail-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleted;
    await expect(cards).toHaveCount(0);
  });

  test("filename search narrows the grid and clearing restores it", async ({
    page,
  }) => {
    await page.goto("pages/media");
    const fileInput = page.locator(
      '[data-testid="media-library-upload"] input[type="file"]',
    );
    const cards = page.locator(
      "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
    );
    // Two uploads with distinct names so the filter has something to
    // separate. Serial suite: the previous test left the library empty.
    for (const name of ["sunset-beach.png", "invoice-q3.png"]) {
      const confirmed = page.waitForResponse(
        (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
      );
      await fileInput.setInputFiles({
        name,
        mimeType: "image/png",
        buffer: PNG_1X1,
      });
      await confirmed;
    }
    await expect(cards).toHaveCount(2);

    await page.getByTestId("media-library-search").fill("sunset");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("sunset-beach.png");

    await page.getByTestId("media-library-search").fill("zzz-no-such-file");
    await expect(page.getByTestId("media-library-no-matches")).toBeVisible();
    await expect(page.getByTestId("media-library-dropzone")).toHaveCount(0);

    await page.getByTestId("media-library-search").fill("");
    await expect(cards).toHaveCount(2);
  });
});

test("a save from a tab whose copy another tab saved over shows the conflict", async ({
  page,
  context,
}) => {
  await page.goto("pages/media");
  const confirmed = page.waitForResponse(
    (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
  );
  await page
    .locator('[data-testid="media-library-upload"] input[type="file"]')
    .setInputFiles({
      name: "contested.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
  await confirmed;
  const other = await context.newPage();
  await other.goto("pages/media");
  const altOf = async (tab: Page) => {
    await tab.getByTestId("media-library-search").fill("contested");
    await tab
      .locator(
        "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
      )
      .first()
      .click();
    return tab.locator("[data-testid^='media-detail-'][data-testid$='-alt']");
  };
  const mine = await altOf(page);
  const theirs = await altOf(other);

  const theirsSaved = other.waitForResponse(
    (r) => r.url().endsWith("/media/update") && r.status() === 200,
  );
  await theirs.fill("saved in the other tab");
  await theirs.press("Enter");
  await theirsSaved;
  await mine.fill("saved from a stale copy");
  await mine.press("Enter");

  await expect(page.getByTestId("media-library-banner-error")).toContainText(
    "changed elsewhere since you opened it",
  );
  await expect(mine).toHaveValue("saved in the other tab");
});

test("a second save chains from the etag the first returned, before the list refetches", async ({
  page,
}) => {
  await page.goto("pages/media");
  const confirmed = page.waitForResponse(
    (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
  );
  await page
    .locator('[data-testid="media-library-upload"] input[type="file"]')
    .setInputFiles({
      name: "chained.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
  await confirmed;
  await page.getByTestId("media-library-search").fill("chained");
  const cards = page.locator(
    "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
  );
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("chained.png");
  await cards.first().click();
  const alt = page.locator(
    "[data-testid^='media-detail-'][data-testid$='-alt']",
  );
  // Only the update's own answer can carry the new etag to the second save.
  await page.route("**/media/list", (route) => route.abort());

  const saves: number[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/media/update")) saves.push(r.status());
  });
  for (const text of ["first", "second"]) {
    const saved = page.waitForResponse((r) =>
      r.url().endsWith("/media/update"),
    );
    await alt.fill(text);
    await alt.press("Enter");
    await saved;
  }

  expect(saves).toEqual([200, 200]);
});

test("admin page ships styled controls", async ({ page }) => {
  await page.goto("pages/media");
  await expect(page.getByTestId("media-library")).toBeVisible();

  const ui = await styledControls(page, "media-library");
  expect(ui.total).toBeGreaterThan(0);
  expect(ui.styled).toBeGreaterThan(0);
});

/**
 * Counts the plugin shell's interactive controls and how many carry a
 * styling class — a count of 0 is the unstyled-component regression signal.
 */
async function styledControls(page: Page, shellTestId: string) {
  return page.evaluate((id) => {
    const shell = document.querySelector(`[data-testid="${id}"]`);
    const controls = shell
      ? Array.from(shell.querySelectorAll("button, a, input, select, label"))
      : [];
    return {
      total: controls.length,
      styled: controls.filter(
        (el) => (el.getAttribute("class") ?? "").trim().length > 0,
      ).length,
    };
  }, shellTestId);
}
