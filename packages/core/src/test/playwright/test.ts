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
import { resolvePlaygroundDbPath } from "./runtime-e2e.js";

/**
 * Lives beside the database, inside the state the webServer wipes, so a
 * stale baseline can never outlive the database it describes.
 */
const BASELINE_FILENAME = "plumix-e2e-baseline.json";

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
 * `test` with the database baseline restored once per worker, which for a retry
 * means once per attempt; per-test resets would break `describe.serial` suites.
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
      const file = join(
        dirname(resolvePlaygroundDbPath(cwd)),
        BASELINE_FILENAME,
      );
      const db = await openPlaygroundDb({ cwd });
      try {
        if (existsSync(file)) {
          await restoreDbBaseline(
            db.$client,
            parseDbBaseline(await readFile(file, "utf8")),
          );
        } else {
          // No baseline yet means this is the run's first worker, right after
          // globalSetup. Written via rename so a reader never sees it
          // half-written.
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
