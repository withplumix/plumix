import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { plumixSourcePaths } from "@plumix/vitest-config/source-resolver";

/**
 * jiti tries each listed extension on a `./x.js` before its `.ts` sibling,
 * about half of a config evaluation; workspace source imports only these.
 */
const JITI_EXTENSIONS = [".js", ".mjs", ".ts", ".tsx"];

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
  const env: Record<string, string> = {
    JITI_TSCONFIG_PATHS: dir,
    JITI_EXTENSIONS: JSON.stringify(JITI_EXTENSIONS),
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
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
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  };
}
