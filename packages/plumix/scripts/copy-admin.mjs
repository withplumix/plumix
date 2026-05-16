// Copies the compiled @plumix/admin workspace output into plumix's own dist
// so the admin artifact ships inside the plumix npm tarball. Run after tsc
// as part of `pnpm --filter plumix build`. Also copies non-TS assets from
// src/admin/ that tsc skips (e.g. theme.css consumed by the per-plugin
// Tailwind compile).
//
// `cp` is wrapped in a retry-with-backoff because turbo runs `plumix:build`
// concurrently with `@plumix/admin#test:e2e` (both depend only on
// admin#build). The e2e fixture step (`build-runtime-proof-plugin.ts`) and
// `vite preview` both touch `admin/dist/` during their startup window, and
// the parallel `cp` here can observe transient ENOENT mid-walk on slow CI
// runners. Retrying with backoff resolves the race without serialising the
// turbo graph or duplicating dist into a temp staging directory.

import { copyFile, cp, readdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../admin/dist");
const DEST = resolve(HERE, "../dist/admin-app");
const THEME_SRC = resolve(HERE, "../src/admin/theme.css");
const THEME_DEST = resolve(HERE, "../dist/admin/theme.css");

const COPY_RETRIES = 5;
const COPY_RETRY_BASE_MS = 250;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function cpWithRetry(src, dest, options) {
  for (let attempt = 1; attempt <= COPY_RETRIES; attempt += 1) {
    try {
      await rm(dest, { recursive: true, force: true });
      await cp(src, dest, options);
      return attempt;
    } catch (err) {
      const isLastAttempt = attempt === COPY_RETRIES;
      const isTransient = err?.code === "ENOENT" || err?.code === "EBUSY";
      if (isLastAttempt || !isTransient) throw err;
      const delay = COPY_RETRY_BASE_MS * attempt;
      console.warn(
        `cp ${src} → ${dest} hit ${err.code} on attempt ${String(attempt)}; ` +
          `retrying in ${String(delay)}ms…`,
      );
      await sleep(delay);
    }
  }
  return COPY_RETRIES;
}

if (!(await exists(SRC))) {
  throw new Error(
    `@plumix/admin is not built — expected ${SRC}. Run \`pnpm --filter @plumix/admin build\` first.`,
  );
}

const attempts = await cpWithRetry(SRC, DEST, { recursive: true });

await copyFile(THEME_SRC, THEME_DEST);

const entries = await readdir(DEST);
console.log(
  `Copied admin (${String(entries.length)} entries) from ${SRC} to ${DEST}` +
    (attempts > 1 ? ` (after ${String(attempts)} attempts)` : ""),
);
console.log(`Copied theme tokens to ${THEME_DEST}`);
