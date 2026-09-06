import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "plumix/test/playwright";

// The one case only Node has: `plumix dev` here is a Vite server that
// evaluates the config through its own module runner, so an edit is served
// only if the runner's cache is invalidated along the import chain
// (`invalidateFile` in `src/commands/dev.ts`). Cloudflare gets the same effect
// from wrangler restarting the worker, which is why the shared spec does not
// carry this.
//
// It is also the one e2e side effect landing outside the wiped `data/`: it
// rewrites a git-tracked source file.
const CONFIG = join(import.meta.dirname, "../playground/plumix.config.ts");
const BASELINE = "config-edit-baseline";
const EDITED = "config-edit-served";

// An edit and the restage it triggers each take seconds on a loaded runner,
// and this drives two of them.
test.setTimeout(120_000);

// In teardown rather than a `finally`: a test timeout tears the body down
// without unwinding it, and an edit left behind would make every retry fail on
// the guard below instead of on whatever actually broke.
test.afterEach(async () => {
  const current = await readFile(CONFIG, "utf8");
  if (current.includes(EDITED)) {
    await writeFile(CONFIG, current.replace(EDITED, BASELINE));
  }
});

async function expectFrontPageMarker(
  page: Page,
  marker: string,
): Promise<void> {
  // Polled: the edit lands on the watcher's schedule, and the request that
  // follows it is what rebuilds the app.
  await expect(async () => {
    // Leading slash — `baseURL` is the admin base path, not the site root.
    await page.goto("/");
    await expect(page.getByTestId("config-marker")).toHaveText(marker);
  }).toPass({ timeout: 45_000 });
}

test("a config edit while the server runs is served", async ({ page }) => {
  const original = await readFile(CONFIG, "utf8");
  const edited = original.replace(`"${BASELINE}"`, `"${EDITED}"`);
  // Renaming the marker would leave both reads below asserting nothing.
  expect(
    edited,
    `${CONFIG} must carry the "${BASELINE}" marker this case rewrites`,
  ).not.toBe(original);

  await expectFrontPageMarker(page, BASELINE);
  await writeFile(CONFIG, edited);
  await expectFrontPageMarker(page, EDITED);
});
