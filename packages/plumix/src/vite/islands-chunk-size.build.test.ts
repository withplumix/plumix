import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { expect, test } from "vitest";

type ViteManifest = Record<string, { readonly file: string }>;

/**
 * The eager element chunk must carry no React. Measured ~3.5 KB gz; React
 * would add ~60 KB, so 4 KB leaves headroom while still catching it.
 */
const ELEMENT_CHUNK_CEILING_BYTES = 4 * 1024;
/** A real Vite build — give it room beyond vitest's 5s default. */
const BUILD_TIMEOUT_MS = 30_000;

test(
  "the islands element chunk stays under 3 KB gz (React lives in the lazy renderer chunk)",
  async () => {
    const require = createRequire(import.meta.url);
    const runtime = require.resolve("@plumix/core/blocks/island-runtime");
    const renderer = require.resolve("@plumix/core/blocks/island-renderer");

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
      // Without it the dev-only error overlay's lazy `import()` pulls React
      // DOM into a shared chunk, a build shape that never ships.
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.PLUMIX_DEV": '""',
      },
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
    // Without `preserveEntrySignatures: "strict"` the renderer tree-shakes to
    // an empty chunk, which would also pass the negative guard.
    expect(rendererBytes).toBeGreaterThan(50 * 1024);
  },
  BUILD_TIMEOUT_MS,
);
