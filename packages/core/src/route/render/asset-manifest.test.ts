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
