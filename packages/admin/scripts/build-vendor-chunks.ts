import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { SHARED_RUNTIME_CHUNK_NAMES } from "@plumix/core";

import {
  isValidIdentifier,
  renderVendorEntrySource,
} from "../src/lib/vendor-entry.js";

/**
 * Build the host's shared-runtime libraries as standalone ESM bundles
 * so plugin chunks can import them via the importmap injected into the
 * admin's `index.html`.
 *
 * Why a separate build step (not Vite's `manualChunks`): Vite/Rolldown
 * mangles chunk exports for cross-chunk linking within the same build.
 * Plugin chunks and the admin bundle are independent builds, so each
 * vendor file must expose the package's full named-export API verbatim.
 *
 * Why introspect at build time: most of these packages still ship
 * CommonJS source. esbuild's CJS-to-ESM interop puts the API on a
 * `default` export only — `import { useState } from "react"` against
 * such a bundle returns undefined. We dynamically import each package
 * in Node, enumerate its public keys, and emit an ESM entry with
 * explicit `export const` re-exports for each. The list stays in sync
 * with whatever the upstream package actually exports.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ADMIN_ROOT, "dist/vendor");

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const built = await Promise.all(
    Object.entries(SHARED_RUNTIME_CHUNK_NAMES).map(([specifier, chunk]) =>
      buildOne(specifier, chunk),
    ),
  );
  console.log(
    `[admin/vendor] built ${String(built.length)} chunk(s) → ${OUT_DIR}`,
  );
}

async function buildOne(specifier: string, chunk: string): Promise<void> {
  const namespace = (await import(specifier)) as Record<string, unknown>;

  const namedKeys = Object.keys(namespace)
    .filter((k) => k !== "default" && isValidIdentifier(k))
    .sort();
  const hasDefault = "default" in namespace;
  const entrySource = renderVendorEntrySource(specifier, namedKeys, hasDefault);

  const result = await build({
    stdin: {
      contents: entrySource,
      resolveDir: ADMIN_ROOT,
      loader: "ts",
      sourcefile: `vendor-${chunk}.ts`,
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "warning",
  });

  const out = result.outputFiles[0];
  if (!out) throw new Error(`esbuild produced no output for "${specifier}"`);
  await writeFile(resolve(OUT_DIR, `${chunk}.js`), out.contents);
}

await main();
