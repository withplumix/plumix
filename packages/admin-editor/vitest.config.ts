import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // These suites render heavy surfaces (Tiptap, cmdk, and Radix
      // Select/Popover portals) and drive them via userEvent, which costs more
      // than the 5s default allows for.
      //
      // The comment here used to blame "a loaded CI box", and that reason is
      // gone — it was added when turbo ran ten packages at once and this
      // suite's worst test hit 5110ms on a 4-vCPU runner (#2174 capped that).
      // It stays on its own merits. Measured across five cold runs at
      // `--concurrency=2`: 89 tests here are slow enough for vitest to report,
      // 22 peak above 1000ms, and the top three — 2386ms, 1591ms, 1509ms —
      // clear 5s by only 2.1-3.3x. That is a dense band, not one outlier, so
      // neither the bare default nor a per-test override on the slowest test
      // is safe: a bad-luck runner would have ~22 candidates to fail.
      testTimeout: 15_000,
    },
  }),
);
