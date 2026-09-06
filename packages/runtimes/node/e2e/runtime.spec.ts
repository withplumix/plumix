import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, runtimeSpec, test } from "plumix/test/playwright";

const CONFIG = join(import.meta.dirname, "../playground/plumix.config.ts");
const BASELINE = "config-edit-baseline";
const EDITED = "config-edit-served";

runtimeSpec();

// The one case only Node has: `plumix dev` here is a Vite server that evaluates
// the config through its own module runner, so an edit is served only if the
// runner's cache is invalidated along the import chain (`invalidateFile` in
// `src/commands/dev.ts`). Cloudflare gets the same effect from wrangler
// restarting the worker. It is also the one e2e side effect landing outside the
// wiped `data/`: it rewrites a git-tracked source file.
//
// Declared after the shared spec, and in this file rather than its own,
// because tests run in declaration order within a file while across files only
// the filename decides. The order is load-bearing: the restage a config edit
// triggers leaves some admin chunks 404ing for the rest of the dev server's
// life (#2225), so anything reaching the admin after this case fails. Reverting
// the order is the regression test for that issue.
test.describe("a config edit while the server runs", () => {
  // An edit and a restage each take seconds on a loaded runner, and this drives
  // two of them.
  test.setTimeout(120_000);

  // In teardown rather than a `finally`: a test timeout tears the body down
  // without unwinding it, and an edit left behind would make every retry fail
  // on the guard below instead of on whatever actually broke.
  test.afterEach(async () => {
    const current = await readFile(CONFIG, "utf8");
    if (current.includes(EDITED)) {
      await writeFile(CONFIG, current.replace(EDITED, BASELINE));
    }
  });

  test("is served", async ({ page }) => {
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
