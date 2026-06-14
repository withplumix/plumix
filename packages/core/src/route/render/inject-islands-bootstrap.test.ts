import { describe, expect, test } from "vitest";

import { injectIslandsBootstrap } from "./inject-islands-bootstrap.js";

describe("injectIslandsBootstrap", () => {
  test("returns the body unchanged when no <plumix-island> is present", () => {
    const body = "<header><h1>Static</h1></header>";
    expect(injectIslandsBootstrap(body, {}, "serve")).toBe(body);
    expect(injectIslandsBootstrap(body, {}, "build")).toBe(body);
  });

  test("dev mode uses the source entry — manifest is ignored even when present", () => {
    // A stale `dist/.vite/manifest.json` from a previous build must not
    // leak hashed prod paths into dev responses.
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    const staleManifest = {
      ".plumix/islands-entry.ts": {
        file: "assets/plumix-islands-runtime.abc.js",
        isEntry: true,
      },
      ".plumix/islands-renderer-entry.ts": {
        file: "assets/plumix-islands-renderer.def.js",
        isEntry: true,
      },
    };
    const out = injectIslandsBootstrap(body, staleManifest, "serve");
    expect(out).toContain('src="/.plumix/islands-entry.ts"');
    expect(out).toContain(
      'data-plumix-renderer-url="/.plumix/islands-renderer-entry.ts"',
    );
  });

  test("build mode uses the hashed manifest URLs for runtime + renderer", () => {
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    const manifest = {
      ".plumix/islands-entry.ts": {
        file: "assets/plumix-islands-runtime-abc123.js",
        isEntry: true,
      },
      ".plumix/islands-renderer-entry.ts": {
        file: "assets/plumix-islands-renderer-def456.js",
        isEntry: true,
      },
    };
    const out = injectIslandsBootstrap(body, manifest, "build");
    expect(out).toContain('src="/assets/plumix-islands-runtime-abc123.js"');
    expect(out).toContain(
      'data-plumix-renderer-url="/assets/plumix-islands-renderer-def456.js"',
    );
  });

  test("build mode prefixes the basePath so islands hydrate under a subdirectory", () => {
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    const manifest = {
      ".plumix/islands-entry.ts": {
        file: "assets/plumix-islands-runtime-abc123.js",
        isEntry: true,
      },
      ".plumix/islands-renderer-entry.ts": {
        file: "assets/plumix-islands-renderer-def456.js",
        isEntry: true,
      },
    };
    const out = injectIslandsBootstrap(
      body,
      manifest,
      "build",
      "/custom-directory",
    );
    expect(out).toContain(
      'src="/custom-directory/assets/plumix-islands-runtime-abc123.js"',
    );
    expect(out).toContain(
      'data-plumix-renderer-url="/custom-directory/assets/plumix-islands-renderer-def456.js"',
    );
  });

  test("build mode falls back to the dev paths when manifest entries are missing", () => {
    // First-build edge: manifest exists but doesn't have the entries yet
    // (the cold-build ordering @cloudflare/vite-plugin produces). Don't
    // break the page — emit the dev paths so it still hydrates locally.
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    const out = injectIslandsBootstrap(body, {}, "build");
    expect(out).toContain('src="/.plumix/islands-entry.ts"');
    expect(out).toContain(
      'data-plumix-renderer-url="/.plumix/islands-renderer-entry.ts"',
    );
  });
});
