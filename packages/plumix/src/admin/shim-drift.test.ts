import { existsSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";

import type { SharedAdminRuntimeSpecifier } from "@plumix/core/admin";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_KEYS,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "@plumix/core/admin";

import manifest from "../../package.json" with { type: "json" };

// Drift detection. Each admin shim hand-re-exports a curated slice of an
// upstream package off `globalThis.plumix.runtime` (admin ships precompiled;
// plugin chunks reach deps via that global). The shims are an *intentional*
// surface, not a mirror — so this guards the failure that actually breaks
// plugins: a binding a shim re-exports having DISAPPEARED upstream (a dangling
// `ns.X` that resolves to `undefined`), e.g. an upstream rename/removal.
//
// It deliberately does NOT fail when upstream *adds* an export the shim hasn't
// adopted. That additive churn forced a manual `KNOWN_GAPS` edit (with a
// written rationale) on every routine dependency bump and didn't scale with
// upstream release cadence (see #1177). New upstream APIs are exposed pull-
// based: add the binding to the shim when a plugin actually needs it.

const SHIMS = Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((spec) => {
  const name = spec as SharedAdminRuntimeSpecifier;
  const slug = adminRuntimeShimSlug(name);
  const module = new URL(`./${slug}.ts`, import.meta.url);
  return {
    name,
    slug,
    module,
    load: (): Promise<Readonly<Record<string, unknown>>> =>
      import(/* @vite-ignore */ module.href),
  };
});

// Stands in for admin's `window.plumix.runtime`: each upstream namespace
// under the key core's roster assigns it, which admin's object is checked
// against at compile time.
beforeAll(async () => {
  const runtime = Object.fromEntries(
    await Promise.all(
      SHIMS.map(async ({ name }): Promise<[string, unknown]> => {
        const ns: unknown = await import(/* @vite-ignore */ name);
        return [SHARED_ADMIN_RUNTIME_KEYS[name], ns];
      }),
    ),
  );
  (globalThis as { plumix?: unknown }).plumix = { runtime };
});

// `default` / `module.exports` / `__esModule` are namespace artefacts whose
// value can legitimately be `undefined` — never treat them as a broken binding.
const ALWAYS_SKIPPED_KEYS = new Set([
  "default",
  "module.exports",
  "__esModule",
]);

// The plugin-bundle Vite step aliases each shared specifier to
// `plumix/admin/<slug>`, so a slug missing its module or its export entry
// would otherwise surface only when a consumer builds a plugin.
describe("shim roster", () => {
  test.each(SHIMS)("$name has a shim module", ({ module }) => {
    expect(existsSync(module)).toBe(true);
  });

  test.each(SHIMS)("$name has a package export", ({ slug }) => {
    expect(manifest.exports).toHaveProperty([`./admin/${slug}`], {
      types: `./dist/admin/${slug}.d.ts`,
      default: `./dist/admin/${slug}.js`,
    });
  });
});

describe("shim drift vs upstream packages", () => {
  test.each(SHIMS)(
    "$name shim re-exports only bindings upstream still provides",
    async ({ name, load }) => {
      const shim = await load();
      // A re-export wired to `ns.X` resolves to a real value when upstream
      // still provides `X`, and to `undefined` once upstream renames or removes
      // it. Surface those — they're the silent breakage for plugins.
      const broken = Object.keys(shim).filter(
        (k) => !ALWAYS_SKIPPED_KEYS.has(k) && shim[k] === undefined,
      );
      expect(
        broken,
        `Shim "${name}" re-exports bindings that no longer exist upstream: ` +
          `${broken.join(", ")}. Upstream renamed or removed them — update ` +
          `packages/plumix/src/admin/<shim>.ts.`,
      ).toEqual([]);
    },
  );
});
