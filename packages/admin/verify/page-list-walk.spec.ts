import { expect, test } from "@playwright/test";

import type { RunningSite } from "./site.js";
import { adminPageList } from "./page-list.js";
import { findSite, siteRegistry, startSite } from "./site.js";
import { verifyPage } from "./verify-page.js";

/**
 * Its entry types, taxonomies and settings page cover every kind of page the
 * manifest lists but a plugin page.
 */
const site = findSite("seo");
if (site === undefined) throw new Error("The seo playground is missing.");
const pages = adminPageList(await siteRegistry(site));

let running: RunningSite;

test.beforeAll(async () => {
  running = await startSite(site);
});

test.afterAll(async () => {
  await running.stop();
});

// One worker for the file, since a second would boot the same playground
// over the first.
test.describe.configure({ mode: "default" });

for (const page of pages) {
  test(`${page.route} on the seo playground opens as admin with a clean report`, async ({
    browser,
  }, testInfo) => {
    const report = await verifyPage({
      browser,
      site,
      adminURL: running.adminURL,
      role: "admin",
      route: page.route,
      out: testInfo.outputPath(),
      video: false,
    });

    expect(report).toMatchObject({
      consoleErrors: [],
      failedRequests: [],
      axeViolations: [],
    });
    expect(new URL(report.finalUrl).pathname).toBe(
      `/_plumix/admin${page.route}`,
    );
  });
}
