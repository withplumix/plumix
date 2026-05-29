import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

// Prototype-pollution defense. The client-side runtime does
// `mod[exportName]` to look up the component; a malicious or
// accidentally-named `__proto__` / `constructor` / `prototype` export
// would resolve to `Object.prototype` or the module's constructor and
// `createRoot(...).render(<Component />)` would throw or worse —
// emit DOM in a confused state. Matches Astro's
// `FORBIDDEN_COMPONENT_EXPORT_KEYS` set.
const FORBIDDEN_EXPORT_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

interface UseClientFinding {
  readonly exportName: string;
}

export function findUseClientIslands(
  source: string,
): readonly UseClientFinding[] {
  // Cheap reject before paying the parse cost.
  if (!source.includes("use client")) return [];
  const sourceFile = ts.createSourceFile(
    "use-client-scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX,
  );
  // RSC convention: `"use client"` must be the first non-comment
  // statement. TypeScript exposes it as an `ExpressionStatement` whose
  // expression is a string literal — matches both `"use client";` and
  // `'use client';`. Anything else as the first statement disqualifies.
  const first = sourceFile.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return [];
  const expr = first.expression;
  if (!ts.isStringLiteral(expr) || expr.text !== "use client") return [];

  const seen = new Set<string>();
  const out: UseClientFinding[] = [];
  const push = (name: string): void => {
    if (FORBIDDEN_EXPORT_KEYS.has(name) || seen.has(name)) return;
    seen.add(name);
    out.push({ exportName: name });
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    ) {
      if (!hasExportModifier(statement)) continue;
      if (hasDefaultModifier(statement)) push("default");
      else if (statement.name) push(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      if (!hasExportModifier(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) push(decl.name.text);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      // `export default <expr>`.
      if (!statement.isExportEquals) push("default");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      // `export { Foo, Bar as Baz } [from "..."]`.
      // Re-exports from another module (`... from "..."`) name the
      // current file as the chunk source, so they're skipped — the
      // re-exporter isn't the island module.
      if (statement.moduleSpecifier) continue;
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause))
        continue;
      for (const element of statement.exportClause.elements) {
        // `name` is the outward-facing name (after `as`); we feed the
        // chunk's `mod[exportName]` lookup, so use the outward name.
        push(element.name.text);
      }
    }
  }
  return out;
}

function hasExportModifier(node: ts.HasModifiers): boolean {
  return (
    ts
      .getModifiers(node)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

function hasDefaultModifier(node: ts.HasModifiers): boolean {
  return (
    ts
      .getModifiers(node)
      ?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false
  );
}

// Vite virtual-module suffix the SSR shim uses to read the original
// `"use client"` source — the plugin's `resolveId`/`load` serve the
// unmodified file at this query and `transform` short-circuits, so the
// shim's `import * as __orig from "<file>?plumix-orig"` doesn't
// recursively re-trigger this transform.
export const ORIG_QUERY = "?plumix-orig";

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
  const findings = findUseClientIslands(source);
  if (findings.length === 0) return null;

  const origUrl = JSON.stringify(filePath + ORIG_QUERY);
  const chunkUrl = JSON.stringify(options.chunkUrl);
  const lines: string[] = [
    `import { createElement as __c } from "react";`,
    // Route props through `serializeProps` so Date/Map/Set/etc. survive
    // the round-trip the custom element's `deserializeProps` expects.
    // Plain JSON.stringify would silently coerce them.
    `import { serializeProps as __ser } from "plumix/blocks";`,
    `import * as __orig from ${origUrl};`,
    // Default prefetch trigger per hydration trigger. `interaction`'s
    // `visible` default is the one that makes the first click feel instant
    // — the chunk is warm before the user reaches the island.
    `const __PREFETCH_DEFAULTS = { load: "load", idle: "load", visible: "visible", interaction: "visible", only: "load" };`,
    // `wrapped` is the full prop set fed to the SSR'd Component (with
    // React-element props replaced by <plumix-static-slot> wrappers).
    // `rest` is the JSON-safe subset for the serialized `props=`
    // attribute — element props are excluded and bridged via
    // StaticHtml on hydrate.
    `function __split(props) {`,
    `  const { client, prefetch, ...rest } = props ?? {};`,
    `  const slots = [];`,
    `  const wrapped = {};`,
    `  for (const k of Object.keys(rest)) {`,
    `    const v = rest[k];`,
    `    if (v != null && typeof v === "object" && typeof v.$$typeof === "symbol") {`,
    `      slots.push(k);`,
    `      wrapped[k] = __c("plumix-static-slot", { "data-plumix-slot": k }, v);`,
    `      delete rest[k];`,
    `    } else {`,
    `      wrapped[k] = v;`,
    `    }`,
    `  }`,
    `  return { client, prefetch, rest, wrapped, slots };`,
    `}`,
  ];
  for (const finding of findings) {
    const name = finding.exportName;
    const isDefault = name === "default";
    const targetLiteral = JSON.stringify(name);
    const exportPrefix = isDefault
      ? "export default function PlumixIsland(props)"
      : `export function ${name}(props)`;
    lines.push(
      `${exportPrefix} {`,
      `  const { client, prefetch, rest, wrapped, slots } = __split(props);`,
      // Default hydration trigger is `interaction` — hydrate on first user
      // intent, replay the event. Authors opt into eager/visible/idle
      // explicitly; the common case pays for JS only when engaged.
      `  const __when = typeof client === "string" ? client : "interaction";`,
      `  const __pf = typeof prefetch === "string" ? prefetch : (__PREFETCH_DEFAULTS[__when] || "load");`,
      // `only` skips SSR entirely: empty shell, no `ssr` gate attribute, the
      // client renders into it on connect.
      `  const __only = __when === "only";`,
      `  return __c("plumix-island", {`,
      `    "chunk-url": ${chunkUrl},`,
      `    "component-export": ${targetLiteral},`,
      `    "client": __when,`,
      `    "prefetch": __pf,`,
      `    "props": __ser(rest),`,
      `    "slots": slots.length ? slots.join(",") : null,`,
      `    "ssr": __only ? null : "",`,
      `  }, __only ? null : __c(__orig[${targetLiteral}], wrapped));`,
      `}`,
    );
  }
  return { code: lines.join("\n") };
}

/**
 * Discovered island after `scanUserSources` walks the user's source
 * tree. `sourcePath` is the absolute path to the `"use client"` module;
 * the Vite plugin uses it to (a) extend `rollupOptions.input` with a
 * per-island client entry and (b) emit `import { Component } from
 * "<sourcePath>"` in the `virtual:plumix/island-manifest` virtual
 * module.
 */
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
 * Walks `cwd` and any workspace-symlinked packages under `node_modules`
 * so a theme or plugin can ship `"use client"` files in its own `src/`
 * without explicit registration. The `walkSymlinkedDeps` realpath gate
 * keeps the scan out of the pnpm store.
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
      for (const finding of findUseClientIslands(source)) {
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
    if (!entry.isDirectory) continue;
    if (entry.name.startsWith(".")) continue;
    const full = join(nodeModulesPath, entry.name);
    if (entry.name.startsWith("@")) {
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
