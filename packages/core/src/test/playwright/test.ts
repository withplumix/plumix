import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test as base } from "@playwright/test";

import {
  captureDbBaseline,
  parseDbBaseline,
  restoreDbBaseline,
  serializeDbBaseline,
} from "./db-baseline.js";
import { openPlaygroundDb } from "./open-playground-db.js";

// Lives inside the state directory the webServer wipes, so a stale
// baseline can never outlive the database it describes.
const BASELINE_SUBPATH = ".wrangler/state/plumix-e2e-baseline.json";

export interface PlumixWorkerOptions {
  /**
   * Playground directory, relative to `testDir`. Set for you by
   * `definePlumixE2EConfig` when you pass `playground`; there is no
   * reason to set it by hand.
   */
  readonly plumixPlayground: string | undefined;
}

interface PlumixWorkerFixtures {
  readonly plumixDbBaseline: void;
}

/**
 * `test` with the database baseline wired in. Import it instead of
 * `@playwright/test` in a worker-driven suite and a retry starts from
 * the same database its first attempt did.
 *
 * The whole problem is that `rm -rf .wrangler/state` belongs to the
 * webServer command, which Playwright runs once per suite run — so the
 * second attempt inherits whatever the first left behind. A worker-scoped
 * fixture is the one hook that matches that cadence: Playwright discards
 * the worker after a failure and starts a fresh one, so this runs once
 * per worker process, which for a retry means once per attempt.
 * `definePlumixE2EConfig` pins playground suites to a single worker,
 * without which it would instead be once per parallel worker, mid-run.
 *
 * Running before the first test rather than between tests is deliberate:
 * several suites are `describe.serial` sequences whose later tests build
 * on what earlier ones created, and a per-test reset would destroy them.
 * The flip side is that tests within one attempt are not isolated from
 * each other — two tests mutating the same row still need to be ordered
 * or disjoint.
 *
 * D1 only: R2, KV and Durable Object state under `.wrangler/state` are
 * still wiped once per suite run.
 */
export const test = base.extend<
  object,
  PlumixWorkerOptions & PlumixWorkerFixtures
>({
  plumixPlayground: [undefined, { scope: "worker", option: true }],
  plumixDbBaseline: [
    async ({ plumixPlayground }, use, workerInfo) => {
      if (plumixPlayground === undefined) {
        await use();
        return;
      }
      // `playground` is relative to the config file, which is also what
      // the baked `cd <playground>` resolves against. `rootDir` is the
      // reporters' base — it only coincides while `testDir` stays ".".
      const { configFile, rootDir } = workerInfo.config;
      const cwd = resolve(
        configFile ? dirname(configFile) : rootDir,
        plumixPlayground,
      );
      const file = join(cwd, BASELINE_SUBPATH);
      const db = await openPlaygroundDb({ cwd });
      try {
        if (existsSync(file)) {
          await restoreDbBaseline(
            db.$client,
            parseDbBaseline(await readFile(file, "utf8")),
          );
        } else {
          // No baseline yet means this is the run's first worker:
          // globalSetup has finished and nothing has driven the site, so
          // this is the state every later attempt comes back to. Written
          // via rename so a reader can never catch it half-written.
          const draft = `${file}.tmp`;
          await writeFile(
            draft,
            serializeDbBaseline(await captureDbBaseline(db.$client)),
          );
          await rename(draft, file);
        }
      } finally {
        db.$client.close();
      }
      await use();
    },
    { scope: "worker", auto: true },
  ],
});

export { expect } from "@playwright/test";
