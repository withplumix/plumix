import { statSync } from "node:fs";
import { resolve } from "node:path";

const SUFFIXES = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.js"] as const;

/** The file a relative `spec` names from `siteRoot`, as written or with a suffix. */
export function resolveSiteModule(
  siteRoot: string,
  spec: string,
): string | undefined {
  const base = resolve(siteRoot, spec);
  return SUFFIXES.map((suffix) => base + suffix).find((file) =>
    statSync(file, { throwIfNoEntry: false })?.isFile(),
  );
}
