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
    };
    expect(injectIslandsBootstrap(body, staleManifest, "serve")).toContain(
      '<script type="module" src="/.plumix/islands-entry.ts"></script>',
    );
  });

  test("build mode uses the hashed manifest URL when present", () => {
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    const manifest = {
      ".plumix/islands-entry.ts": {
        file: "assets/plumix-islands-runtime-abc123.js",
        isEntry: true,
      },
    };
    expect(injectIslandsBootstrap(body, manifest, "build")).toContain(
      '<script type="module" src="/assets/plumix-islands-runtime-abc123.js"></script>',
    );
  });

  test("build mode falls back to the dev path when manifest entry is missing", () => {
    // First-build edge: manifest exists but doesn't have the runtime
    // entry yet (the cold-build ordering @cloudflare/vite-plugin
    // produces). Don't break the page — emit the dev path so the page
    // still hydrates locally even in this transient state.
    const body = '<plumix-island chunk-url="/x"></plumix-island>';
    expect(injectIslandsBootstrap(body, {}, "build")).toContain(
      '<script type="module" src="/.plumix/islands-entry.ts"></script>',
    );
  });
});
