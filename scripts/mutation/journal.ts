import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/**
 * Stryker restores the files it rewrites on a clean exit, not on SIGKILL, so their exact bytes go
 * here first, for whatever run comes next.
 */
const JOURNAL = ".cache/mutation/journal";
/** The Vitest runner writes these into the package and deletes them only on a clean shutdown. */
const RUNNER_SETUP = /^stryker-setup-\d+\.js$/;

export function save(packageDir: string, files: readonly string[]): void {
  const dir = path.join(packageDir, JOURNAL);
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, string> = {};
  files.forEach((file, index) => {
    const saved = String(index);
    writeFileSync(
      path.join(dir, saved),
      readFileSync(path.join(packageDir, file)),
    );
    manifest[file] = saved;
  });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

/** Puts back every file a run journaled, and returns how many. */
export function restore(packageDir: string): number {
  for (const name of readdirSync(packageDir)) {
    if (RUNNER_SETUP.test(name)) rmSync(path.join(packageDir, name));
  }
  const dir = path.join(packageDir, JOURNAL);
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return 0;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    string
  >;
  for (const [file, saved] of Object.entries(manifest)) {
    writeFileSync(
      path.join(packageDir, file),
      readFileSync(path.join(dir, saved)),
    );
  }
  rmSync(dir, { recursive: true, force: true });
  return Object.keys(manifest).length;
}
