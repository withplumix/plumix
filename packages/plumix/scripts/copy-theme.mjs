// Copies plumix's admin theme.css into dist — tsc doesn't emit non-TS assets,
// and the per-plugin Tailwind compile reads it from dist/admin/theme.css. The
// admin SPA itself is no longer copied here: it ships as the @plumix/admin
// package and the vite plugin resolves it from node_modules.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../src/admin/theme.css");
const DEST = resolve(HERE, "../dist/admin/theme.css");

await mkdir(dirname(DEST), { recursive: true });
await copyFile(SRC, DEST);
console.log(`Copied theme tokens to ${DEST}`);
