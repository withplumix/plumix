import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { plumixSourcePaths } from "@plumix/vitest-config/source-resolver";

const JITI_TSCONFIG_PATHS = "JITI_TSCONFIG_PATHS";

/**
 * A TS module names a sibling by its emitted `.js`; jiti maps that to `.ts`
 * only, so a `.tsx` sibling is found here.
 */
function tsSibling(specifier: string, parentURL: string | undefined) {
  if (!specifier.startsWith(".") || !specifier.endsWith(".js")) return null;
  if (!parentURL?.startsWith("file:")) return null;
  const parent = fileURLToPath(parentURL);
  if (!/\.tsx?$/.test(parent)) return null;
  const base = join(dirname(parent), specifier.slice(0, -".js".length));
  if (existsSync(`${base}.js`)) return null;
  for (const extension of [".ts", ".tsx"]) {
    if (existsSync(base + extension)) return base + extension;
  }
  return null;
}

/**
 * What `plumixSourceResolver()` does for Vite, for jiti, the CLI's config
 * loader: a CLI command run in-process then needs no package built.
 */
export function loadConfigsFromSource(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "plumix-source-paths-"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: plumixSourcePaths() } }),
  );
  const previous = process.env[JITI_TSCONFIG_PATHS];
  process.env[JITI_TSCONFIG_PATHS] = dir;
  // Bun has no `registerHooks`, and its own resolver already maps `./x.js` to
  // an `x.ts` or `x.tsx` sibling.
  const hooks =
    "Bun" in globalThis
      ? undefined
      : registerHooks({
          resolve(specifier, context, nextResolve) {
            const sibling = tsSibling(specifier, context.parentURL);
            return sibling === null
              ? nextResolve(specifier, context)
              : { url: pathToFileURL(sibling).href, shortCircuit: true };
          },
        });
  return () => {
    hooks?.deregister();
    if (previous === undefined) delete process.env[JITI_TSCONFIG_PATHS];
    else process.env[JITI_TSCONFIG_PATHS] = previous;
    rmSync(dir, { recursive: true, force: true });
  };
}
