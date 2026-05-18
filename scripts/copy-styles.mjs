#!/usr/bin/env node
// Copies every `*.css` from `src/` into the matching `dist/` path so
// the aggregate `src/styles.css` (which `@import`s each per-block
// stylesheet) resolves at consume time. tsc only compiles .ts, so we
// shadow the source layout for CSS as well — that way Vite (admin) and
// future SSR bundles can `import "@plumix/blocks/styles.css"` and
// follow the same relative `@import` paths the source used.

import { readdirSync, cpSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

let copied = 0;
try {
  statSync(SRC);
} catch {
  console.error(`copy-styles: ${SRC} not found`);
  process.exit(1);
}

for (const file of walk(SRC)) {
  if (!file.endsWith(".css")) continue;
  const dest = join(DIST, relative(SRC, file));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(file, dest);
  copied += 1;
}

console.log(`copy-styles: copied ${copied} CSS file(s)`);
