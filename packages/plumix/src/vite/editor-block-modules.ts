import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { BlockModuleRef } from "./block-module-resolver.js";
import {
  dedupe,
  resolveBlockModulePaths,
  resolveShortcodeModulePaths,
} from "./block-module-resolver.js";
import { extractConfigModules } from "./config-modules.js";

const MODULE_EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"] as const;
const JS_EXT = /\.(js|jsx|mjs)$/;

/**
 * Maps the authored `.js` extension back to the `.ts` source so Vite can load
 * it.
 */
export function collectEditorBlockModules(
  configPath: string,
  configSource: string,
): readonly BlockModuleRef[] {
  return collectEditorModules(
    configPath,
    configSource,
    resolveBlockModulePaths,
  );
}

/**
 * Editor-importable shortcode modules for every shortcode a config's theme and
 * plugins declare in their `shortcodes` field, resolved to files the same way
 * {@link collectEditorBlockModules} resolves blocks.
 */
export function collectEditorShortcodeModules(
  configPath: string,
  configSource: string,
): readonly BlockModuleRef[] {
  return collectEditorModules(
    configPath,
    configSource,
    resolveShortcodeModulePaths,
  );
}

function collectEditorModules(
  configPath: string,
  configSource: string,
  modulesOf: (source: string, file: string) => readonly BlockModuleRef[],
): readonly BlockModuleRef[] {
  const { theme, plugins } = extractConfigModules(configSource, configPath);
  // Theme last: the canvas and admin registries are last-write-wins, matching
  // the server's `core < plugin < theme` precedence.
  const specifiers = [...plugins, ...(theme ? [theme] : [])];

  const refs: BlockModuleRef[] = [];
  for (const specifier of specifiers) {
    const file = resolveModuleFile(specifier, configPath);
    if (!file) continue; // module not locatable — contributes nothing
    const source = readFileSync(file, "utf8");
    for (const ref of modulesOf(source, file)) {
      refs.push({
        module: isAbsolute(ref.module) ? toSourceFile(ref.module) : ref.module,
        exportName: ref.exportName,
      });
    }
  }
  return dedupe(refs);
}

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

function toSourceFile(path: string): string {
  if (isFile(path)) return path;
  return probe(path.replace(JS_EXT, "")) ?? path;
}

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
