import { describe, expect, test } from "vitest";

import type { AssetManifest } from "./asset-manifest.js";
import {
  bundledCssTags,
  devThemeCssLinks,
  devThemeStylesTag,
} from "./asset-manifest.js";

describe("bundledCssTags", () => {
  test("emits a stylesheet <link> for every CSS file linked from an entry chunk", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
        css: ["_plumix/assets/theme-def456.css"],
      },
    };
    expect(bundledCssTags(manifest, "build")).toBe(
      '<link rel="stylesheet" href="/_plumix/assets/theme-def456.css" />',
    );
  });

  test("prefixes the configured basePath so theme CSS loads under a subdirectory", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "assets/theme-abc123.js",
        isEntry: true,
        css: ["assets/theme-def456.css"],
      },
    };
    expect(bundledCssTags(manifest, "build", "/custom-directory")).toBe(
      '<link rel="stylesheet" href="/custom-directory/assets/theme-def456.css" />',
    );
  });

  test("emits nothing when no entry chunk references CSS", () => {
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
      },
    };
    expect(bundledCssTags(manifest, "build")).toBe("");
  });

  test("emits nothing for an empty manifest", () => {
    expect(bundledCssTags({}, "build")).toBe("");
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
    const html = bundledCssTags(manifest, "build");
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
    const html = bundledCssTags(manifest, "build");
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
    expect(bundledCssTags(manifest, "build")).toBe(
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
    const html = bundledCssTags(manifest, "build");
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
    expect(bundledCssTags(manifest, "build")).toBe(
      '<link rel="stylesheet" href="/_plumix/assets/theme.css" />',
    );
  });

  test("serve mode emits nothing even when a stale build manifest is present", () => {
    // #1492: a manifest left on disk by a prior `plumix build` must not
    // emit links the dev server would 404 on.
    const manifest: AssetManifest = {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
        css: ["_plumix/assets/theme-def456.css"],
      },
    };
    expect(bundledCssTags(manifest, "serve")).toBe("");
  });
});

describe("devThemeStylesTag", () => {
  test("serve mode loads the client entry so Vite injects the theme CSS", () => {
    // Dev has no asset manifest, so `bundledCssTags` is empty; the
    // stylesheets ride in on the Vite-served client entry instead.
    expect(devThemeStylesTag("serve")).toBe(
      '<script type="module" src="/.plumix/client-entry.ts"></script>',
    );
  });

  test("build mode emits nothing — bundledCssTags links the hashed CSS", () => {
    expect(devThemeStylesTag("build")).toBe("");
  });

  test("serve mode prefixes the basePath for a subdirectory install", () => {
    expect(devThemeStylesTag("serve", "/custom-directory")).toBe(
      '<script type="module" src="/custom-directory/.plumix/client-entry.ts"></script>',
    );
  });
});

describe("devThemeCssLinks", () => {
  // #1701: in dev the theme CSS otherwise rides in only via the client-entry
  // <script>, which injects <style> after hydration → flash of unstyled
  // content. A render-blocking <link> to the Vite-served source path paints
  // the first frame styled, matching prod's `bundledCssTags`.
  test("serve mode links a `./`-relative css path as a root-absolute href", () => {
    expect(devThemeCssLinks(["./theme/app.css"], "serve")).toBe(
      '<link rel="stylesheet" href="/theme/app.css" />',
    );
  });

  test("serve mode normalizes a bare relative path to root-absolute", () => {
    expect(devThemeCssLinks(["theme/app.css"], "serve")).toBe(
      '<link rel="stylesheet" href="/theme/app.css" />',
    );
  });

  test("serve mode passes an already root-absolute path through", () => {
    expect(devThemeCssLinks(["/theme/app.css"], "serve")).toBe(
      '<link rel="stylesheet" href="/theme/app.css" />',
    );
  });

  test("serve mode links every entry, in declaration order", () => {
    expect(devThemeCssLinks(["./a.css", "./b.css"], "serve")).toBe(
      '<link rel="stylesheet" href="/a.css" />' +
        '<link rel="stylesheet" href="/b.css" />',
    );
  });

  test("serve mode prefixes the basePath for a subdirectory install", () => {
    expect(
      devThemeCssLinks(["./theme/app.css"], "serve", "/custom-directory"),
    ).toBe('<link rel="stylesheet" href="/custom-directory/theme/app.css" />');
  });

  test("serve mode deduplicates paths that resolve to the same href", () => {
    // `./a.css` and `a.css` normalize to the same URL — link it once,
    // matching `bundledCssTags`'s Set-based dedupe.
    expect(devThemeCssLinks(["./a.css", "a.css", "/a.css"], "serve")).toBe(
      '<link rel="stylesheet" href="/a.css" />',
    );
  });

  // A plain <link href> is resolved by the browser, not Vite's module
  // resolver, so aliased (`~`, `@/`) and npm-scope (`@scope/pkg`) specifiers
  // 404 as links. Those keep riding in on the client-entry <script> import
  // (today's behavior); emitting a knowingly-404ing <link> would just add
  // console noise.
  test("serve mode skips alias and npm-scope specifiers", () => {
    expect(
      devThemeCssLinks(
        ["~/aliased.css", "@acme/ui/style.css", "@/aliased.css"],
        "serve",
      ),
    ).toBe("");
  });

  test("serve mode skips parent-escape paths whose href is ambiguous", () => {
    expect(devThemeCssLinks(["../outside.css"], "serve")).toBe("");
  });

  test("serve mode links only the resolvable entries, leaving the rest to the script", () => {
    expect(
      devThemeCssLinks(["./theme/app.css", "@acme/ui/style.css"], "serve"),
    ).toBe('<link rel="stylesheet" href="/theme/app.css" />');
  });

  test("build mode emits nothing — bundledCssTags links the hashed CSS", () => {
    expect(devThemeCssLinks(["./theme/app.css"], "build")).toBe("");
  });

  test("emits nothing for an empty css array", () => {
    expect(devThemeCssLinks([], "serve")).toBe("");
  });
});
