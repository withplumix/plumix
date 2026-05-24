import { describe, expect, test } from "vitest";

import type { AssetManifest } from "./asset-manifest.js";
import { bundledCssTags } from "./asset-manifest.js";

describe("bundledCssTags", () => {
  test("emits a stylesheet <link> for every CSS file linked from an entry chunk", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
        css: ["_plumix/assets/theme-def456.css"],
      },
    };
    expect(bundledCssTags(manifest)).toBe(
      '<link rel="stylesheet" href="/_plumix/assets/theme-def456.css" />',
    );
  });

  test("emits nothing when no entry chunk references CSS", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
      },
    };
    expect(bundledCssTags(manifest)).toBe("");
  });

  test("emits nothing for an empty manifest", () => {
    expect(bundledCssTags({})).toBe("");
  });

  test("deduplicates css files when multiple entries share the same bundle", () => {
    const manifest: AssetManifest = {
      "src/a.ts": {
        file: "a.js",
        isEntry: true,
        css: ["shared-abc.css"],
      },
      "src/b.ts": {
        file: "b.js",
        isEntry: true,
        css: ["shared-abc.css"],
      },
    };
    const html = bundledCssTags(manifest);
    expect(html).toBe('<link rel="stylesheet" href="/shared-abc.css" />');
    // Exact-match above already pins this; the count check guards
    // against a future refactor accidentally emitting duplicate tags.
    expect(html.split("<link").length - 1).toBe(1);
  });

  test("walks `imports[]` to surface code-split chunks' CSS", () => {
    // Vite splits a heavy theme dependency into its own chunk. The
    // entry references it via `imports[]`; the dependency owns the
    // CSS bytes. Browsers won't load that CSS unless the renderer
    // walks the import graph and emits a <link> for every reachable
    // chunk.
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "assets/theme-abc.js",
        isEntry: true,
        imports: ["_chunks/vendor-xyz.js"],
        css: ["assets/theme-abc.css"],
      },
      "_chunks/vendor-xyz.js": {
        file: "_chunks/vendor-xyz.js",
        css: ["_chunks/vendor-xyz.css"],
      },
    };
    const html = bundledCssTags(manifest);
    expect(html).toContain(
      '<link rel="stylesheet" href="/assets/theme-abc.css" />',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/_chunks/vendor-xyz.css" />',
    );
  });

  test("walks `dynamicImports[]` to surface lazy chunks' CSS", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "assets/theme.js",
        isEntry: true,
        dynamicImports: ["_chunks/lazy.js"],
      },
      "_chunks/lazy.js": {
        file: "_chunks/lazy.js",
        css: ["_chunks/lazy.css"],
      },
    };
    expect(bundledCssTags(manifest)).toBe(
      '<link rel="stylesheet" href="/_chunks/lazy.css" />',
    );
  });

  test("import-graph traversal is cycle-safe", () => {
    // Vite occasionally produces manifests where two non-entry
    // chunks reference each other (circular `imports[]`). The
    // walker must not loop forever.
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "theme.js",
        isEntry: true,
        imports: ["_chunks/a.js"],
      },
      "_chunks/a.js": {
        file: "_chunks/a.js",
        imports: ["_chunks/b.js"],
        css: ["_chunks/a.css"],
      },
      "_chunks/b.js": {
        file: "_chunks/b.js",
        imports: ["_chunks/a.js"],
        css: ["_chunks/b.css"],
      },
    };
    const html = bundledCssTags(manifest);
    expect(html).toContain('<link rel="stylesheet" href="/_chunks/a.css" />');
    expect(html).toContain('<link rel="stylesheet" href="/_chunks/b.css" />');
  });

  test("ignores entries that are not marked isEntry", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme.js",
        isEntry: true,
        css: ["_plumix/assets/theme.css"],
      },
      "src/internal.ts": {
        file: "_plumix/assets/internal.js",
        css: ["_plumix/assets/internal.css"],
      },
    };
    expect(bundledCssTags(manifest)).toBe(
      '<link rel="stylesheet" href="/_plumix/assets/theme.css" />',
    );
  });
});
