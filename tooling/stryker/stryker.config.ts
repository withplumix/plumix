import { fileURLToPath } from "node:url";
import type { PartialStrykerOptions } from "@stryker-mutator/api/core";

const resolve = (specifier: string): string =>
  fileURLToPath(import.meta.resolve(specifier));

/** One package's run; the runner in `scripts/` passes the lines to mutate with `--mutate`. */
export default {
  testRunner: "vitest",
  plugins: [
    resolve("@stryker-mutator/vitest-runner"),
    resolve("@stryker-mutator/typescript-checker"),
    fileURLToPath(new URL("./arid.ts", import.meta.url)),
  ],
  ignorers: ["plumix-arid"],
  // A mutant that does not type-check is a compile error, not a gap the tests left.
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  vitest: { configFile: "vitest.config.ts", related: true },
  coverageAnalysis: "perTest",
  // The default sandbox copy cannot resolve the workspace packages the tests import from source.
  inPlace: true,
  // Vitest strips types without checking them, so this would only rewrite every file in place.
  disableTypeChecks: false,
  // A mutant that runs at import has no per-test coverage, so each one reruns every related test.
  ignoreStatic: true,
  // Changed lines no test imports are a finding, every mutant uncovered, not a failed run.
  allowEmpty: true,
  timeoutMS: 15_000,
  reporters: ["json"],
  jsonReporter: { fileName: ".cache/mutation/raw.json" },
  tempDirName: ".cache/stryker-tmp",
  cleanTempDir: "always",
} satisfies PartialStrykerOptions;
