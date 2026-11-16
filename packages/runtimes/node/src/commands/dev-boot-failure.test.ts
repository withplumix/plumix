import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { DevSite } from "../test/dev-site.js";
import {
  BOOT_TIMEOUT,
  CONFIG_FILE,
  POLL,
  siteConfig,
  startDevSite,
} from "../test/dev-site.js";

/** Apart from `dev.test.ts`, so the two boots run in parallel workers. */
let site: DevSite;

beforeAll(async () => {
  site = await startDevSite();
}, BOOT_TIMEOUT);

afterAll(() => site.close());

describe("plumix dev on the node runtime", { timeout: 240_000 }, () => {
  test("a boot failure renders the dev boot-error page, and the next good edit recovers", async () => {
    writeFileSync(
      join(site.dir, CONFIG_FILE),
      siteConfig(site.dir, "[probes, probes]"),
    );
    await expect
      .poll(() => fetch(`${site.origin()}/`).then((r) => r.status), POLL)
      .toBe(500);
    const page = await fetch(`${site.origin()}/`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("appears more than once");

    writeFileSync(join(site.dir, CONFIG_FILE), siteConfig(site.dir));

    await expect.poll(() => site.text("/probe/alive"), POLL).toBe("alive");
  });
});
