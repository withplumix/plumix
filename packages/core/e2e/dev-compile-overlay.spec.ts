import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

import { waitForDevClient } from "./support/dev-client.js";

/** Gitignored, and inside the playground root, so Vite serves and watches it. */
const SCRATCH = resolve(import.meta.dirname, "../playground/e2e-scratch");
const BROKEN = resolve(SCRATCH, "broken.ts");
const MODULE_URL = "/e2e-scratch/broken.ts";

/** Imports the scratch module the way a page would, failing or not. */
async function importScratch(page: Page): Promise<string> {
  return page.evaluate(
    (url) =>
      import(url).then(
        () => "loaded",
        () => "failed",
      ),
    MODULE_URL,
  );
}

test.describe("the dev compile overlay", () => {
  test.beforeEach(async ({ page }) => {
    await mkdir(SCRATCH, { recursive: true });
    await writeFile(BROKEN, "export const broken = ;\n");
    await page.goto("/islands");
    await waitForDevClient(page);
  });

  test.afterEach(async () => {
    await rm(SCRATCH, { recursive: true, force: true });
  });

  test("a module that fails to compile opens the compile overlay", async ({
    page,
  }) => {
    expect(await importScratch(page)).toBe("failed");

    await expect(page.getByTestId("plumix-dev-overlay-label")).toHaveText(
      "Compile error",
    );
    await expect(page.getByTestId("plumix-dev-error-message")).toHaveText(
      "Transform failed with 1 error:",
    );
  });

  test("fixing the module clears the compile overlay", async ({ page }) => {
    await importScratch(page);
    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeVisible();

    await writeFile(BROKEN, "export const broken = 1;\n");

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeHidden();
  });

  test("Escape dismisses the compile overlay", async ({ page }) => {
    await importScratch(page);
    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("plumix-dev-overlay-panel")).toBeHidden();
  });
});
