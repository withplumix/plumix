// Pure-function tests for `resolveIslandChunkUrl`. The helper is the
// only thing the SSR shim relies on to bridge dev (`/@fs<id>` direct
// module URL) and build (hashed chunk path from Vite's manifest).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { resolveIslandChunkUrl } from "./index.js";

describe("resolveIslandChunkUrl", () => {
  test("dev mode returns /@fs<absolute-id>", () => {
    const url = resolveIslandChunkUrl(
      "/abs/path/to/counter.tsx",
      "serve",
      "/anything",
    );
    expect(url).toBe("/@fs/abs/path/to/counter.tsx");
  });

  describe("build mode", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "plumix-island-chunk-"));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    test("looks up the hashed chunk URL from Vite's manifest by source path relative to root", () => {
      // Vite stores manifest entries keyed by source path relative to
      // the project root — the rollupOptions.input name we registered
      // (`island-<slug>-<hash>`) is only used as the chunk's `.name`,
      // not as the manifest lookup key.
      const id = join(root, "src", "counter.tsx");
      const manifestDir = join(root, "dist", "client", ".vite");
      mkdirSync(manifestDir, { recursive: true });
      writeFileSync(
        join(manifestDir, "manifest.json"),
        JSON.stringify({
          "src/counter.tsx": { file: "assets/counter.abc123.js" },
        }),
      );

      expect(resolveIslandChunkUrl(id, "build", root)).toBe(
        "/assets/counter.abc123.js",
      );
    });

    test("falls back to /@fs<id> when the manifest entry is missing", () => {
      // Empty manifest — happens on the first build before the client
      // env has finished and the worker env's transform fires.
      const id = join(root, "src", "counter.tsx");
      const manifestDir = join(root, "dist", "client", ".vite");
      mkdirSync(manifestDir, { recursive: true });
      writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify({}));

      expect(resolveIslandChunkUrl(id, "build", root)).toBe("/@fs" + id);
    });

    test("falls back when no manifest file exists at all", () => {
      // No `dist/.vite/manifest.json` — earliest cold-build state.
      const id = join(root, "src", "counter.tsx");
      expect(resolveIslandChunkUrl(id, "build", root)).toBe("/@fs" + id);
    });
  });
});
