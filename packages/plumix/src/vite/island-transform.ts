import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";

/**
 * One block-side island discovered in a source file. The Vite plugin
 * uses this to build the manifest virtual module: `localBindingName`
 * is what the SSR-side `BlockSpec.client.component` reference points
 * at, `importPath` is what the client-side chunk entry imports from,
 * and `exportName` is the named export the chunk should re-export
 * (or "default" for default imports — emitted as such by the manifest
 * codegen).
 *
 * Limitations of the v1 scanner:
 * - Only named and default imports are resolved. Namespace imports
 *   (`import * as M from "..."`) and re-exports are out of scope; a
 *   block author hitting those falls off the discovery path and the
 *   walker degrades to a plain `<div>` (no island wrapper).
 * - The `defineBlock` identifier must be the literal name — if the
 *   block author aliases it (`defineBlock as db`), we don't detect.
 *   Documented as a known limitation in the slice spec.
 */
interface IslandFinding {
  readonly localBindingName: string;
  readonly importPath: string;
  readonly exportName: string;
}

// JS identifier shape — letters / digits / _ / $, can't start with a digit.
// The manifest codegen interpolates `exportName` directly as an
// *identifier* in an `import { ... }` form, so an export that doesn't
// match (e.g. a TS string-literal export like `"weird-name"`) would
// produce uncompilable codegen. Findings with a non-identifier export
// are dropped — the block falls off the discovery path and the walker
// degrades to a plain `<div>` per the design.
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

// Prototype-pollution defense. The client-side runtime does
// `mod[exportName]` to look up the component; a malicious or
// accidentally-named `__proto__` / `constructor` / `prototype` export
// would resolve to `Object.prototype` or the module's constructor and
// `createRoot(...).render(<Component />)` would throw or worse —
// emit DOM in a confused state. Both the codegen here AND the
// client-side island element guard against these keys; defense in
// depth, since export names are author-controlled but the regex alone
// happily admits `__proto__`. Matches Astro's
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
    `import { serializeProps as __ser } from "@plumix/blocks";`,
    `import * as __orig from ${origUrl};`,
    // `wrapped` is the full prop set fed to the SSR'd Component (with
    // React-element props replaced by <plumix-static-slot> wrappers).
    // `rest` is the JSON-safe subset for the serialized `props=`
    // attribute — element props are excluded and bridged via
    // StaticHtml on hydrate.
    `function __split(props) {`,
    `  const { client, ...rest } = props ?? {};`,
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
    `  return { client, rest, wrapped, slots };`,
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
      `  const { client, rest, wrapped, slots } = __split(props);`,
      `  return __c("plumix-island", {`,
      `    "chunk-url": ${chunkUrl},`,
      `    "component-export": ${targetLiteral},`,
      `    "client": typeof client === "string" ? client : "load",`,
      `    "props": __ser(rest),`,
      `    "slots": slots.length ? slots.join(",") : null,`,
      `    "ssr": "",`,
      `  }, __c(__orig[${targetLiteral}], wrapped));`,
      `}`,
    );
  }
  return { code: lines.join("\n") };
}

export function findIslands(
  source: string,
  filePath: string,
): readonly IslandFinding[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    inferScriptKind(filePath),
  );
  const imports = collectImports(sourceFile);
  const findings: IslandFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (isDefineBlockCall(node)) {
      const componentRef = extractClientComponentIdentifier(node);
      if (componentRef !== null) {
        const match = imports.get(componentRef);
        if (
          match &&
          IDENT_RE.test(match.exportName) &&
          !FORBIDDEN_EXPORT_KEYS.has(match.exportName)
        ) {
          findings.push({
            localBindingName: componentRef,
            importPath: match.importPath,
            exportName: match.exportName,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

/**
 * Discovered island after `scanUserSources` resolves an `IslandFinding`'s
 * relative `importPath` against the file it was found in. `sourcePath` is
 * the absolute path to the component's source file; the Vite plugin uses
 * it to (a) extend `rollupOptions.input` with a per-island client entry
 * and (b) emit `import { Component } from "<sourcePath>"` in the
 * `virtual:plumix/island-manifest` virtual module.
 */
export interface DiscoveredIsland {
  readonly sourcePath: string;
  readonly exportName: string;
  /** The file where the `defineBlock` call lives. */
  readonly blockFile: string;
}

/**
 * Injectable fs surface so the scanner is unit-testable without a real
 * directory tree. Production passes Node's `fs` synchronous primitives.
 */
export interface ScannerFs {
  readDir(path: string): readonly { name: string; isDirectory: boolean }[];
  readFile(path: string): string;
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
 * Walks `cwd` recursively, runs `findIslands` on every `.ts`/`.tsx`
 * source it sees (skipping the noise dirs above), and resolves each
 * finding's relative `importPath` to an absolute `sourcePath`. The
 * importPath is resolved against the directory of the file the
 * `defineBlock` call lives in — same semantics as the user's source
 * imports.
 *
 * v1 only walks the user's `cwd`. Block-island declarations in
 * published npm packages (under `node_modules`) are out of scope; a
 * follow-up can opt in via an explicit package list once the use case
 * surfaces. Documented in the `#536` follow-up plan.
 */
export function scanUserSources(
  cwd: string,
  fs: ScannerFs = nodeFs,
): readonly DiscoveredIsland[] {
  const islands: DiscoveredIsland[] = [];
  walk(cwd, fs, (filePath, source) => {
    for (const finding of findIslands(source, filePath)) {
      islands.push({
        sourcePath: resolveImportPath(filePath, finding.importPath),
        exportName: finding.exportName,
        blockFile: toPosix(filePath),
      });
    }
    // `"use client"` modules ARE their own source — sourcePath and
    // blockFile collapse to the file itself; the manifest reads the
    // chunk from this entry the same way it does for defineBlock-
    // discovered components.
    for (const finding of findUseClientIslands(source)) {
      islands.push({
        sourcePath: toPosix(filePath),
        exportName: finding.exportName,
        blockFile: toPosix(filePath),
      });
    }
  });
  return islands;
}

function walk(
  dirPath: string,
  fs: ScannerFs,
  visit: (filePath: string, source: string) => void,
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
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, fs, visit);
      continue;
    }
    if (!SCANNABLE_EXTS.has(extname(entry.name))) continue;
    try {
      const source = fs.readFile(full);
      // Cheap pre-filter: skip files that can't possibly contain either
      // a `defineBlock(...)` call or a `"use client"` directive. Saves
      // the AST parse on the vast majority of user-source files (auth,
      // RPC, db helpers, etc.).
      if (!source.includes("defineBlock") && !source.includes("use client"))
        continue;
      visit(full, source);
    } catch {
      // Unreadable file (permissions, deleted mid-scan) — skip
      // rather than aborting the entire scan.
    }
  }
}

/**
 * Resolve a finding's `importPath` to an absolute file path. Relative
 * paths (`./X`, `../X`) resolve against the block file's directory.
 * Bare specifiers (`@plumix/x`, `react`, etc.) are returned as-is —
 * the manifest emit later passes them through to Vite which knows how
 * to resolve npm packages.
 *
 * Path separators are normalized to POSIX. The downstream emit slots
 * the result into Vite's `/@fs/<path>` dev URL and into the import
 * specifier of the generated manifest module — both require forward
 * slashes regardless of the host OS.
 */
function resolveImportPath(blockFile: string, importPath: string): string {
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return toPosix(resolve(dirname(blockFile), importPath));
  }
  return importPath;
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
};

interface ImportBinding {
  readonly importPath: string;
  readonly exportName: string;
}

function collectImports(
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, ImportBinding> {
  const map = new Map<string, ImportBinding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const importPath = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;
    // Default import: `import Foo from "./Foo"`. The local binding is
    // whatever name the author chose; the export name is "default".
    if (clause.name) {
      map.set(clause.name.text, { importPath, exportName: "default" });
    }
    // Named imports: `import { Foo, Bar as B } from "./x"`. Track the
    // local binding (`B`) -> source export (`Bar`) mapping so an alias
    // doesn't drop the discovery.
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const localName = element.name.text;
        const exportName = element.propertyName?.text ?? localName;
        map.set(localName, { importPath, exportName });
      }
    }
  }
  return map;
}

function isDefineBlockCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return ts.isIdentifier(callee) && callee.text === "defineBlock";
}

function extractClientComponentIdentifier(
  call: ts.CallExpression,
): string | null {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  const clientProp = findObjectProperty(arg, "client");
  if (!clientProp) return null;
  if (!ts.isObjectLiteralExpression(clientProp)) return null;
  const componentProp = findObjectProperty(clientProp, "component");
  if (!componentProp || !ts.isIdentifier(componentProp)) return null;
  return componentProp.text;
}

function findObjectProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | null {
  for (const property of obj.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name;
    if (ts.isIdentifier(key) && key.text === name) return property.initializer;
    if (ts.isStringLiteral(key) && key.text === name)
      return property.initializer;
  }
  return null;
}

function inferScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
