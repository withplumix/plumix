import path from "node:path";
import { fileURLToPath } from "node:url";

/** The config file a package's run passes to `stryker run`. */
export const strykerConfig = fileURLToPath(
  new URL("./stryker.config.ts", import.meta.url),
);

/** Stryker's CLI, run with `node` from the package being mutated. */
export const strykerBin = path.join(
  path.dirname(
    fileURLToPath(import.meta.resolve("@stryker-mutator/core/package.json")),
  ),
  "bin/stryker.js",
);
