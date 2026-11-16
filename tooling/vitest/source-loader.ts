import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

import {
  plumixSourcePaths,
  REPO_ROOT,
} from "@plumix/vitest-config/source-resolver";

/** A name for jiti's `nativeModules`, which matches `node_modules/<name>/`. */
const WORKSPACE_MODULE = "plumix-workspace-source";

/**
 * A TS module names a sibling by its emitted `.js`; Node finds the `.ts` or
 * `.tsx` file beside it only through this.
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

/** The tsconfig `paths` lookup, `*` patterns included. */
function sourceFor(
  paths: Record<string, string[]>,
  specifier: string,
): string | null {
  const exact = paths[specifier]?.[0];
  if (exact) return exact;
  for (const [key, [target]] of Object.entries(paths)) {
    const star = key.indexOf("*");
    if (star === -1 || target === undefined) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
      const matched = specifier.slice(
        prefix.length,
        -suffix.length || undefined,
      );
      return target.replaceAll("*", matched);
    }
  }
  return null;
}

/**
 * Each target through a `node_modules/<WORKSPACE_MODULE>` link to the repo,
 * so jiti imports it natively.
 */
function linkedPaths(
  dir: string,
  paths: Record<string, string[]>,
): Record<string, string[]> {
  const link = join(dir, "node_modules", WORKSPACE_MODULE);
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(REPO_ROOT, link, "dir");
  return Object.fromEntries(
    Object.entries(paths).map(([key, targets]) => [
      key,
      targets.map((target) => join(link, relative(REPO_ROOT, target))),
    ]),
  );
}

/**
 * What `plumixSourceResolver()` does for Vite, for jiti, the CLI's config
 * loader. Workspace source loads natively, once per process, as a site's
 * installed `plumix` does.
 */
export function loadConfigsFromSource(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "plumix-source-paths-"));
  const paths = plumixSourcePaths();
  // Bun has no `registerHooks`, and already imports what jiti resolves
  // natively.
  const bun = "Bun" in globalThis;
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { paths: bun ? paths : linkedPaths(dir, paths) },
    }),
  );
  const env: Record<string, string> = { JITI_TSCONFIG_PATHS: dir };
  if (!bun) env.JITI_NATIVE_MODULES = JSON.stringify([WORKSPACE_MODULE]);
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  const hooks = bun
    ? undefined
    : registerHooks({
        resolve(specifier, context, nextResolve) {
          const target =
            tsSibling(specifier, context.parentURL) ??
            sourceFor(paths, specifier);
          return target === null
            ? nextResolve(specifier, context)
            : { url: pathToFileURL(target).href, shortCircuit: true };
        },
        // Node strips types but compiles neither JSX nor an `enum`.
        load(url, context, nextLoad) {
          if (!/\.tsx?$/.test(url) || url.includes("/node_modules/")) {
            return nextLoad(url, context);
          }
          const file = fileURLToPath(url);
          const { code } = transformSync(readFileSync(file, "utf8"), {
            loader: file.endsWith(".tsx") ? "tsx" : "ts",
            jsx: "automatic",
            format: "esm",
            sourcefile: file,
          });
          return { format: "module", source: code, shortCircuit: true };
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
