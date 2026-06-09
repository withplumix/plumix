import { readFileSync } from "node:fs";
import { join } from "node:path";

// packages/create-plumix-app/src → repo root is three levels up.
export const REPO_ROOT = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "..",
);

/** Read a workspace package's declared version (relative to the repo root). */
export function packageVersion(relDir: string): string {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, relDir, "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}
