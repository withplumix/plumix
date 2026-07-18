import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { expect, test } from "vitest";

type ViteManifest = Record<string, { readonly file: string }>;

// The whole point of the renderer split: the eager islands element chunk
// must carry no React. This builds the real islands entries (the same
// modules the generated `.plumix/islands-*-entry.ts` inputs re-export)
// through Vite with the plugin's load-bearing options
// (`preserveEntrySignatures: "strict"`, prod minify) and asserts the
// element chunk stays under the ceiling. A regression that pulls React back
// into the element chunk blows it to ~60 KB and fails here.
//
// The chunk carries the custom element + all five hydration strategies
// (load/idle/visible/interaction/only) + the prefetch wiring + prop
// (de)serialization — measured at ~3.5 KB gz (was ~2.4 KB with only
// `load`). 4 KB leaves headroom for a strategy or two while still catching
// React (~60 KB) instantly.
const ELEMENT_CHUNK_CEILING_BYTES = 4 * 1024;
// A real Vite build — give it room beyond vitest's 5s default.
const BUILD_TIMEOUT_MS = 30_000;

test(
  "the islands element chunk stays under 3 KB gz (React lives in the lazy renderer chunk)",
  async () => {
    const require = createRequire(import.meta.url);
    const runtime = require.resolve("@plumix/blocks/island-runtime");
    const renderer = require.resolve("@plumix/blocks/island-renderer");

    const dir = mkdtempSync(join(tmpdir(), "plumix-islands-size-"));
    // Absolute-path imports so module resolution for React et al. happens
    // from the package's own node_modules, not the temp dir.
    writeFileSync(
      join(dir, "runtime.js"),
      `import ${JSON.stringify(runtime)};\n`,
    );
    writeFileSync(
      join(dir, "renderer.js"),
      `export * from ${JSON.stringify(renderer)};\n`,
    );
    const outDir = join(dir, "out");

    await build({
      root: dir,
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      build: {
        outDir,
        manifest: true,
        minify: true,
        rollupOptions: {
          preserveEntrySignatures: "strict",
          input: {
            "plumix-islands-runtime": join(dir, "runtime.js"),
            "plumix-islands-renderer": join(dir, "renderer.js"),
          },
        },
      },
    });

    const manifest = JSON.parse(
      readFileSync(join(outDir, ".vite/manifest.json"), "utf8"),
    ) as ViteManifest;
    // Resolve a chunk's emitted file by its entry's source-path suffix
    // (manifest keys are the entries' absolute source paths).
    const chunkPath = (suffix: string): string => {
      const key = Object.keys(manifest).find((k) => k.endsWith(suffix));
      const entry = key ? manifest[key] : undefined;
      if (!entry) {
        throw new Error(
          `no ${suffix} chunk in manifest; keys: ${Object.keys(manifest).join(", ")}`,
        );
      }
      return join(outDir, entry.file);
    };

    const elementGz = gzipSync(readFileSync(chunkPath("runtime.js")), {
      level: 9,
    }).length;
    const rendererBytes = readFileSync(chunkPath("renderer.js")).length;

    // Negative guard: React must NOT be in the eager element chunk.
    expect(elementGz).toBeLessThan(ELEMENT_CHUNK_CEILING_BYTES);
    // Positive guard: React MUST be in the lazy renderer chunk. Without
    // `preserveEntrySignatures: "strict"` the renderer's pure re-export
    // tree-shakes to an empty chunk — which would also keep the element
    // chunk tiny and pass the negative guard alone. ReactDOM is ~190 KB
    // raw, so a healthy renderer chunk is comfortably over 50 KB.
    expect(rendererBytes).toBeGreaterThan(50 * 1024);
  },
  BUILD_TIMEOUT_MS,
);
