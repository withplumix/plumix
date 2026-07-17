import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `tsc` can exit 0 having emitted nothing — stale incremental state is
 * enough to convince it the program is already up to date. Turbo then
 * caches that empty `dist/` as a successful build, and every consumer
 * fails to resolve the package until the cache is busted by hand.
 *
 * Consumers resolve through the `exports` map, so that map is the
 * definition of a usable build: every target it promises must exist. A
 * bundler-built package declares no map, leaving only a weaker floor.
 */
export function checkEmit(packageDir) {
  const manifest = readManifest(packageDir);
  const targets = distTargets(manifest);

  if (targets.length === 0) return checkAnyJavaScript(packageDir);

  const missing = targets.filter((t) => !existsSync(join(packageDir, t)));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Build did not emit ${missing.length} file(s) the package promises: ${missing.join(", ")}.`,
    };
  }
  return { ok: true };
}

function readManifest(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
}

function distTargets(manifest) {
  const targets = new Set();
  for (const value of stringLeaves([
    manifest.exports,
    manifest.bin,
    manifest.main,
  ])) {
    // Wildcard subpaths resolve per-consumer, so there is no single file to assert.
    if (value.startsWith("./dist") && !value.includes("*")) targets.add(value);
  }
  return [...targets];
}

function* stringLeaves(value) {
  if (typeof value === "string") yield value;
  else if (value && typeof value === "object")
    for (const nested of Object.values(value)) yield* stringLeaves(nested);
}

function checkAnyJavaScript(packageDir) {
  const dist = join(packageDir, "dist");
  if (!existsSync(dist) || !hasJavaScript(dist)) {
    return {
      ok: false,
      message: `Build emitted no JavaScript into ${dist} — refusing to cache an empty build.`,
    };
  }
  return { ok: true };
}

function hasJavaScript(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && hasJavaScript(join(dir, entry.name)))
      return true;
    if (entry.isFile() && entry.name.endsWith(".js")) return true;
  }
  return false;
}
