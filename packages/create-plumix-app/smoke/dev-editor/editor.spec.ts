import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import {
  actingAs,
  expect,
  openPlaygroundDb,
  test,
} from "plumix/test/playwright";

// Under `plumix dev` on installed tarballs, Vite's dependency optimizer and
// module rewriting meet installed plugins (#2840). Imports only what the
// project installed.

const PROJECT = resolve(import.meta.dirname, "..");
const CANVAS_FRAME = '[data-testid="plumix-canvas-frame"] iframe';

/**
 * Rejects on the page's first uncaught error, in any of its frames, naming the
 * page it happened on.
 */
function firstPageError(page: Page): Promise<never> {
  return new Promise((_, reject) => {
    page.once("pageerror", (error) => {
      reject(new Error(`pageerror on ${page.url()}: ${error.message}`));
    });
  });
}

/**
 * How a broken dev graph shows: an uncaught error (a module that won't link, a
 * rejected dynamic import), a logged error, or a script request that fails.
 */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => {
    problems.push(`pageerror on ${page.url()}: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()} (${message.location().url})`);
    }
  });
  page.on("response", (response) => {
    if (
      response.request().resourceType() === "script" &&
      response.status() >= 400
    ) {
      problems.push(`${String(response.status())}: ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    problems.push(
      `failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
    );
  });
  return problems;
}

test("the front page loads every module it requests", async ({ page }) => {
  const problems = collectProblems(page);

  // Leading slash: `baseURL` is the admin, and the front page is the site's.
  await page.goto("/", { waitUntil: "networkidle" });

  expect(problems).toEqual([]);
});

// Only uncaught errors fail this session, since the admin aborts requests as it
// navigates. Raced, so the error is reported rather than a later timeout.
test("a block from an installed plugin is selectable in the editor canvas", async ({
  page,
  context,
}) => {
  const pageError = firstPageError(page);
  const db = await openPlaygroundDb({ cwd: PROJECT });
  const { storageState } = await actingAs(db, "editor");
  db.$client.close();
  await context.addCookies([...storageState.cookies]);

  await Promise.race([pageError, selectInstalledBlock(page)]);
});

async function selectInstalledBlock(page: Page): Promise<void> {
  // Opened by URL: the New button's client-side navigation into the editor
  // throws a view-transition error that isn't specific to dev.
  const created = await page.request.post("/_plumix/rpc/entry/create", {
    headers: { "x-plumix-request": "1" },
    data: { json: { type: "post", slug: "dev-editor" } },
  });
  expect(created.status()).toBe(200);
  const { json: entry } = (await created.json()) as {
    json: { id: number };
  };
  await page.goto(`entries/posts/${String(entry.id)}/edit`);
  const canvas = page.frameLocator(CANVAS_FRAME);
  await expect(canvas.locator("[data-plumix-content-root]")).toBeAttached();

  // Inserting selects the image, so the selection moves to the separator first.
  // Through the rail: the image's floating toolbar covers the separator.
  await page.getByTestId("block-catalog-item-core/separator").click();
  await page.getByTestId("block-catalog-item-media/image").click();
  await expect(
    canvas.locator('[data-plumix-block="media/image"]'),
  ).toBeVisible();
  await page.getByTestId("plumix-tab-layers").click();
  await page.locator("[data-testid^='layer-']").first().click();
  await expect(page.getByTestId("block-inspector-no-settings")).toBeVisible();

  await canvas.locator('[data-plumix-block="media/image"]').click();

  await expect(
    page.getByTestId("block-inspector").getByTestId("block-input-alt"),
  ).toBeVisible();
}
