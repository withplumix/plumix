import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// The render test beside this one (`App.direction.browser.test.tsx`) proves
// the provider and hook agree *today*. It can't catch the original failure
// mode: two copies of `@radix-ui/react-direction`
// resolved in the tree (a direct dep pinned to one version, the `radix-ui`
// umbrella pulling another) → two context instances → the provider feeds a
// context the primitives never read. That's a dependency-graph fault, not a
// rendering one, so it's guarded at the lockfile. If a future radix bump (or a
// stray direct dep) re-forks one of these context-bearing packages, this fails
// — extend the list when a new radix context package proves it can bite.
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
          `pnpm.overrides pin. Duplicate React-context packages split the ` +
          `provider from its consumers (the RTL direction bug).`,
      ).toHaveLength(1);
    },
  );
});
