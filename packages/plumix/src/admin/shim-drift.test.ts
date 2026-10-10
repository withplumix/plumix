import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";

import type { SharedAdminRuntimeSpecifier } from "@plumix/core/admin";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_KEYS,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "@plumix/core/admin";

import manifest from "../../package.json" with { type: "json" };

// Fails only when a binding a shim re-exports disappears upstream; additive
// upstream exports are adopted when a plugin needs them, not on every bump.

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

/**
 * Loaded during collection, where no hook timer runs: fourteen packages take
 * several seconds under load, which timed out a beforeAll.
 */
const runtime = Object.fromEntries(
  await Promise.all(
    SHIMS.map(async ({ name }): Promise<[string, unknown]> => {
      const ns: unknown = await import(/* @vite-ignore */ name);
      return [SHARED_ADMIN_RUNTIME_KEYS[name], ns];
    }),
  ),
);
(globalThis as { plumix?: unknown }).plumix = { runtime };

/**
 * `default` / `module.exports` / `__esModule` are namespace artefacts whose
 * value can legitimately be `undefined` — never treat them as a broken binding.
 */
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
      // A re-export of a binding upstream removed resolves to `undefined`,
      // which breaks plugins silently.
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
