import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { extname, join } from "node:path";

import { VitePluginError } from "./errors.js";
import { moduleExportName, parseModule } from "./estree.js";

// The client runtime does `mod[exportName]`; these would resolve to
// `Object.prototype` or the constructor. Matches Astro's
// `FORBIDDEN_COMPONENT_EXPORT_KEYS`.
const FORBIDDEN_EXPORT_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Hook naming convention. A shim replaces the export with a component, so a
// hook in an island module returns a React element instead of running.
const HOOK_EXPORT = /^use[A-Z]/;

interface UseClientFinding {
  readonly exportName: string;
}

export function findUseClientIslands(
  source: string,
  filePath = "use-client-scan.tsx",
): readonly UseClientFinding[] {
  // Cheap reject before paying the parse cost.
  if (!source.includes("use client")) return [];
  const program = parseModule(source, filePath);
  // RSC convention: `"use client"` must be the first non-comment statement — a
  // directive prologue, so `"use client";` and `'use client';` both count and
  // a parenthesized or later string does not.
  const first = program.body[0];
  if (
    first?.type !== "ExpressionStatement" ||
    first.directive !== "use client"
  ) {
    return [];
  }

  const seen = new Set<string>();
  const out: UseClientFinding[] = [];
  const push = (name: string): void => {
    if (FORBIDDEN_EXPORT_KEYS.has(name) || seen.has(name)) return;
    seen.add(name);
    out.push({ exportName: name });
  };

  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      // `export default <function | class | expr>` — an interface is erased.
      if (statement.declaration.type !== "TSInterfaceDeclaration") {
        push("default");
      }
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.exportKind === "type") continue;
    const { declaration } = statement;
    if (
      declaration?.type === "FunctionDeclaration" ||
      declaration?.type === "ClassDeclaration"
    ) {
      if (declaration.id) push(declaration.id.name);
      continue;
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const decl of declaration.declarations) {
        if (decl.id.type === "Identifier") push(decl.id.name);
      }
      continue;
    }
    // `export { Foo, Bar as Baz } [from "..."]`.
    // Re-exports from another module (`... from "..."`) name the
    // current file as the chunk source, so they're skipped — the
    // re-exporter isn't the island module.
    if (declaration || statement.source) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.exportKind === "type") continue;
      // `exported` is the outward-facing name (after `as`); we feed the
      // chunk's `mod[exportName]` lookup, so use the outward name.
      push(moduleExportName(specifier.exported));
    }
  }
  return out;
}

// `transform` short-circuits on this query so the shim's import of the original
// source doesn't re-trigger it.
export const ORIG_QUERY = "?plumix-orig";

// Islands in core's own `blocks/` can't import `plumix/blocks` (a cycle, and
// unresolvable under pnpm), so this resolves it from the project root instead.
export const SERIALIZE_VIRTUAL_ID = "virtual:plumix/island-serialize";

interface TransformUseClientOptions {
  readonly chunkUrl: string;
}

interface TransformUseClientResult {
  readonly code: string;
}

export function transformUseClientModule(
  source: string,
  filePath: string,
  options: TransformUseClientOptions,
): TransformUseClientResult | null {
  const findings = findUseClientIslands(source, filePath);
  if (findings.length === 0) return null;
  // First-party only: published packages legitimately export client-only hooks
  // beside components, and the site author can't fix their files.
  if (!filePath.includes("/node_modules/")) {
    const hook = findings.find((f) => HOOK_EXPORT.test(f.exportName));
    if (hook) {
      throw VitePluginError.islandExportIsHook({
        module: filePath,
        exportName: hook.exportName,
      });
    }
  }

  const origUrl = JSON.stringify(filePath + ORIG_QUERY);
  const chunkUrl = JSON.stringify(options.chunkUrl);
  const lines: string[] = [
    `import { createElement as __c } from "react";`,
    // From the virtual module so a core island in `@plumix/core/blocks`
    // resolves it too.
    `import { IslandShim as __IslandShim } from ${JSON.stringify(SERIALIZE_VIRTUAL_ID)};`,
    `import * as __orig from ${origUrl};`,
  ];
  for (const finding of findings) {
    const name = finding.exportName;
    const isDefault = name === "default";
    const targetLiteral = JSON.stringify(name);
    const exportPrefix = isDefault
      ? "export default function PlumixIsland(props)"
      : `export function ${name}(props)`;
    // Hand the original component + static wiring to IslandShim; the raw
    // props flow through untouched so the shim can decide inline-vs-island
    // at render time from the `InsideIsland` context.
    lines.push(
      `${exportPrefix} {`,
      `  return __c(__IslandShim, {`,
      `    Component: __orig[${targetLiteral}],`,
      `    exportName: ${targetLiteral},`,
      `    chunkUrl: ${chunkUrl},`,
      `    props,`,
      `  });`,
      `}`,
    );
  }
  return { code: lines.join("\n") };
}

/** `sourcePath` is the absolute path to the `"use client"` module. */
export interface DiscoveredIsland {
  readonly sourcePath: string;
  readonly exportName: string;
}

/**
 * Injectable fs surface so the scanner is unit-testable without a real
 * directory tree. Production passes Node's `fs` synchronous primitives.
 */
export interface ScannerFs {
  readDir(path: string): readonly { name: string; isDirectory: boolean }[];
  readFile(path: string): string;
  isSymlink(path: string): boolean;
  /** Resolves a symlink to its target; identity for plain paths. */
  realPath(path: string): string;
}

const SCANNABLE_EXTS: ReadonlySet<string> = new Set([".ts", ".tsx"]);
const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".plumix",
  "dist",
  ".wrangler",
  ".turbo",
  ".cache",
  ".git",
]);

/**
 * Also walks workspace-symlinked packages under `node_modules`, so a theme or
 * plugin's `"use client"` files need no registration; never the pnpm store.
 */
export function scanUserSources(
  cwd: string,
  fs: ScannerFs = nodeFs,
): readonly DiscoveredIsland[] {
  const islands: DiscoveredIsland[] = [];
  walk(
    cwd,
    fs,
    (filePath, source) => {
      for (const finding of findUseClientIslands(source, filePath)) {
        islands.push({
          sourcePath: toPosix(filePath),
          exportName: finding.exportName,
        });
      }
    },
    true,
  );
  return islands;
}

function walk(
  dirPath: string,
  fs: ScannerFs,
  visit: (filePath: string, source: string) => void,
  followSymlinks: boolean,
): void {
  let entries: readonly { name: string; isDirectory: boolean }[];
  try {
    entries = fs.readDir(dirPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory) {
      if (entry.name === "node_modules") {
        if (followSymlinks) walkSymlinkedDeps(full, fs, visit);
        continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, fs, visit, followSymlinks);
      continue;
    }
    if (!SCANNABLE_EXTS.has(extname(entry.name))) continue;
    try {
      const source = fs.readFile(full);
      // Cheap pre-filter: skip files that can't possibly contain a
      // `"use client"` directive. Saves the AST parse on the vast
      // majority of user-source files.
      if (!source.includes("use client")) continue;
      visit(full, source);
    } catch {
      // Unreadable file (permissions, deleted mid-scan) — skip
      // rather than aborting the entire scan.
    }
  }
}

// pnpm symlinks every dep — workspace AND published — so isSymlink
// alone can't tell them apart. Discriminator: a workspace dep
// realpaths outside any `node_modules` segment; a published dep
// realpaths back into `.pnpm/<pkg>@<ver>/node_modules/<pkg>`.
function walkSymlinkedDeps(
  nodeModulesPath: string,
  fs: ScannerFs,
  visit: (filePath: string, source: string) => void,
): void {
  let entries: readonly { name: string; isDirectory: boolean }[];
  try {
    entries = fs.readDir(nodeModulesPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(nodeModulesPath, entry.name);
    // A package symlink reports `isDirectory: false`, so it must not be
    // filtered out before the symlink branch below.
    if (entry.isDirectory && entry.name.startsWith("@")) {
      walkSymlinkedDeps(full, fs, visit);
      continue;
    }
    if (!fs.isSymlink(full)) continue;
    const target = fs.realPath(full);
    if (target.includes("/node_modules/")) continue;
    // Walk the realpath so recorded paths match what Vite emits after
    // its default `preserveSymlinks: false` resolution.
    walk(target, fs, visit, false);
  }
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

const nodeFs: ScannerFs = {
  readDir: (path) =>
    readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    })),
  readFile: (path) => readFileSync(path, "utf8"),
  isSymlink: (path) => {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  },
  realPath: (path) => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  },
};
