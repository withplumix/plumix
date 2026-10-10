import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Two resolved copies of a context package give the provider a context the
 * primitives never read, a dependency-graph fault the render test can't catch.
 */
const SINGLETON_RADIX_CONTEXT_PACKAGES = ["@radix-ui/react-direction"] as const;

describe("radix context packages resolve to a single instance", () => {
  const lockfile = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../pnpm-lock.yaml"),
    "utf8",
  );

  test.each(SINGLETON_RADIX_CONTEXT_PACKAGES)(
    "%s has exactly one resolved version",
    (pkg) => {
      const escaped = pkg.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
      const versions = new Set(
        [
          ...lockfile.matchAll(
            new RegExp(`${escaped}@(\\d+\\.\\d+\\.\\d+)`, "g"),
          ),
        ].map((m) => m[1]),
      );

      expect(
        [...versions],
        `${pkg} resolved to multiple versions — run \`pnpm dedupe\` or add a ` +
          `pnpm-workspace.yaml override. Duplicate React-context packages split the ` +
          `provider from its consumers (the RTL direction bug).`,
      ).toHaveLength(1);
    },
  );
});
