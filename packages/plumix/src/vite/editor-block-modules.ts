import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { BlockModuleRef } from "./block-module-resolver.js";
import { dedupe, resolveBlockModulePaths } from "./block-module-resolver.js";
import { extractConfigModules } from "./config-modules.js";

const MODULE_EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"] as const;
const JS_EXT = /\.(js|jsx|mjs)$/;

/**
 * Editor-importable block modules (path + the export to take) for every block a
 * config's theme (via its `blocks` field) and plugins (via `ctx.registerBlock(s)`
 * calls) declare. Reads the config to locate each theme / plugin module, scans it
 * for those block bindings, and resolves the recovered specifiers to real files
 * on disk — mapping the authored `.js` extension back to the `.ts` source so the
 * generated editor entry imports something Vite can load. Bare package specifiers
 * pass through untouched for Vite to resolve.
 */
export function collectEditorBlockModules(
  configPath: string,
  configSource: string,
): readonly BlockModuleRef[] {
  const { theme, plugins } = extractConfigModules(configSource);
  // Plugin modules first, theme last: the canvas (`createBlockRegistry`) and the
  // admin (`registerPluginBlock`) are both last-write-wins, so a theme block
  // overrides a same-named plugin block — the `core < plugin < theme` precedence
  // the server registry gives.
  const specifiers = [...plugins, ...(theme ? [theme] : [])];

  const refs: BlockModuleRef[] = [];
  for (const specifier of specifiers) {
    const file = resolveModuleFile(specifier, configPath);
    if (!file) continue; // module not locatable — contributes no editor blocks
    const source = readFileSync(file, "utf8");
    for (const ref of resolveBlockModulePaths(source, file)) {
      refs.push({
        module: isAbsolute(ref.module) ? toSourceFile(ref.module) : ref.module,
        exportName: ref.exportName,
      });
    }
  }
  return dedupe(refs);
}

/** Resolve an import specifier (from the config) to a file on disk. */
function resolveModuleFile(
  specifier: string,
  fromFile: string,
): string | undefined {
  if (specifier.startsWith(".")) {
    return probe(resolve(dirname(fromFile), specifier));
  }
  try {
    return createRequire(fromFile).resolve(specifier);
  } catch {
    return undefined;
  }
}

/** Map an emitted `.js` path back to its real source file (`.ts`, index, …). */
function toSourceFile(path: string): string {
  if (isFile(path)) return path;
  return probe(path.replace(JS_EXT, "")) ?? path;
}

/** Try `<base><ext>` and `<base>/index<ext>` across module extensions. */
function probe(base: string): string | undefined {
  if (isFile(base)) return base;
  for (const ext of MODULE_EXTS) {
    if (isFile(base + ext)) return base + ext;
  }
  for (const ext of MODULE_EXTS) {
    const indexed = join(base, `index${ext}`);
    if (isFile(indexed)) return indexed;
  }
  return undefined;
}

const isFile = (path: string): boolean =>
  existsSync(path) && statSync(path).isFile();
