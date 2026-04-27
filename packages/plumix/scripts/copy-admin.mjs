// Copies the compiled @plumix/admin workspace output into plumix's own dist
// so the admin artifact ships inside the plumix npm tarball. Run after tsc
// as part of `pnpm --filter plumix build`. Also copies non-TS assets from
// src/admin/ that tsc skips (e.g. theme.css consumed by the per-plugin
// Tailwind compile).

import { copyFile, cp, readdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../admin/dist");
const DEST = resolve(HERE, "../dist/admin-app");
const THEME_SRC = resolve(HERE, "../src/admin/theme.css");
const THEME_DEST = resolve(HERE, "../dist/admin/theme.css");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(SRC))) {
  throw new Error(
    `@plumix/admin is not built — expected ${SRC}. Run \`pnpm --filter @plumix/admin build\` first.`,
  );
}

await rm(DEST, { recursive: true, force: true });
await cp(SRC, DEST, { recursive: true });

await copyFile(THEME_SRC, THEME_DEST);

const entries = await readdir(DEST);
console.log(
  `Copied admin (${String(entries.length)} entries) from ${SRC} to ${DEST}`,
);
console.log(`Copied theme tokens to ${THEME_DEST}`);
