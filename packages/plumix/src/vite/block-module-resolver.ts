import { dirname, resolve } from "node:path";
import ts from "typescript";

import { VitePluginError } from "./errors.js";

/**
 * A block module the editor entry must import, and the export to take from it.
 * `module` is an import specifier (from the extractors) or a resolved absolute
 * path (from {@link resolveBlockModulePaths}); `exportName` is `"default"`, a
 * named export, or `"*"` — so the codegen imports the exact binding the author
 * declared rather than assuming a default export.
 */
export interface BlockModuleRef {
  readonly module: string;
  readonly exportName: string;
}

/**
 * Result of recovering a theme's `blocks`-field block modules statically from
 * config source (so the editor bundle can import them while the author writes
 * the plain `import blocks from "./blocks"; { blocks }` form). Plugin blocks take
 * the imperative path instead — see {@link extractRegisteredBlockModules}.
 *
 * Only whole-module imports are resolvable, and the factory (`defineTheme` /
 * `definePlugin`) must be imported from `plumix` — that provenance is what keeps
 * a local look-alike from being mistaken for a config. Two static-analysis
 * limits are accepted rather than papered over: a local binding that *shadows*
 * an import is read as the import, and a `blocks` reachable only through an
 * object spread (`{ ...base }`) is not followed.
 */
export type BlockModuleResult =
  | { readonly ok: true; readonly modules: readonly BlockModuleRef[] }
  | { readonly ok: false; readonly reason: string };

const FACTORY_EXPORTS = new Set(["defineTheme", "definePlugin"]);
const isPlumixSpecifier = (spec: string): boolean =>
  spec === "plumix" || spec.startsWith("plumix/");

const NOT_IMPORTED = {
  ok: false,
  reason: "`blocks` is not a resolvable import binding",
} as const;

/**
 * A generated `import` statement binding `ref`'s export to the local name
 * `local` — default or named — so codegen imports the exact binding the author
 * declared. Shared by the canvas editor entry and the admin bundle.
 */
export function blockImportStatement(
  ref: BlockModuleRef,
  local: string,
): string {
  const from = JSON.stringify(ref.module);
  if (ref.exportName === "default") return `import ${local} from ${from};`;
  return `import { ${ref.exportName} as ${local} } from ${from};`;
}

/**
 * A generated expression that normalizes `local` to a `BlockSpec[]` — a single
 * spec (`ctx.registerBlock(x)`) becomes `[x]`, an array (`registerBlocks` / a
 * theme's `blocks` field) passes through, and a missing export becomes `[]`.
 * Lets both codegens spread/iterate the result without a "not iterable" crash.
 */
export function blockSpecsArrayExpr(local: string): string {
  return `(Array.isArray(${local}) ? ${local} : ${local} ? [${local}] : [])`;
}

function refKey(ref: BlockModuleRef): string {
  return `${ref.module}\0${ref.exportName}`;
}

/** Dedupe block refs by `module`+`exportName`, keeping first-insertion order. */
export function dedupe(
  refs: readonly BlockModuleRef[],
): readonly BlockModuleRef[] {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
}

/**
 * Block modules a theme/plugin config declares, with each `module` resolved to
 * an absolute filesystem path (bare package specifiers pass through untouched).
 * `moduleFsPath` is the config module the source came from; relative specifiers
 * resolve against its directory. Throws (naming the module) when a `blocks`
 * field binding can't be resolved statically.
 */
export function resolveBlockModulePaths(
  source: string,
  moduleFsPath: string,
): readonly BlockModuleRef[] {
  // A theme declares blocks via the `blocks` field (must resolve statically —
  // throw if it can't); a plugin registers them imperatively via
  // `ctx.registerBlock(s)` calls (best-effort — untraceable calls are skipped).
  const field = extractBlockModules(source);
  if (!field.ok) {
    throw VitePluginError.blockModuleUnresolvable({
      module: moduleFsPath,
      reason: field.reason,
    });
  }
  const dir = dirname(moduleFsPath);
  const refs = [...field.modules, ...extractRegisteredBlockModules(source)];
  return dedupe(
    refs.map((ref) => ({
      module: ref.module.startsWith(".")
        ? resolve(dir, ref.module)
        : ref.module,
      exportName: ref.exportName,
    })),
  );
}

/**
 * Block modules behind every `ctx.registerBlock(x)` / `ctx.registerBlocks([…])`
 * call nested inside a plumix `definePlugin(...)` in a plugin's source, traced to
 * their imports. Best-effort: an argument that isn't a plain imported binding (a
 * computed value, an inline `defineBlock`) is skipped, so those blocks won't
 * appear in the editor canvas.
 */
export function extractRegisteredBlockModules(
  source: string,
): readonly BlockModuleRef[] {
  const sf = parse(source);
  const { importOf, factoryLocals } = buildImportMaps(sf);
  const refs: BlockModuleRef[] = [];
  // Only `registerBlock(s)` calls nested inside a plumix `definePlugin(...)` are
  // trusted — matching purely on the method name would fire on an unrelated
  // `someLib.registerBlock(x)` and pull the wrong module into the editor.
  const walk = (node: ts.Node, insideFactory: boolean): void => {
    const isFactory =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      factoryLocals.has(node.expression.text);
    if (
      insideFactory &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "registerBlock" ||
        node.expression.name.text === "registerBlocks")
    ) {
      for (const arg of node.arguments) collectBindingRefs(arg, importOf, refs);
    }
    ts.forEachChild(node, (child) => walk(child, insideFactory || isFactory));
  };
  walk(sf, false);
  return dedupe(refs);
}

// A `registerBlock(x)` / `registerBlocks(arr)` identifier, or the elements of a
// `registerBlocks([a, ...b])` array literal, traced to their import bindings.
function collectBindingRefs(
  node: ts.Expression,
  importOf: ReadonlyMap<string, BlockModuleRef>,
  out: BlockModuleRef[],
): void {
  if (ts.isIdentifier(node)) {
    const ref = importOf.get(node.text);
    if (ref) out.push(ref);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      const ident = ts.isSpreadElement(element) ? element.expression : element;
      if (ts.isIdentifier(ident)) {
        const ref = importOf.get(ident.text);
        if (ref) out.push(ref);
      }
    }
  }
}

const parse = (source: string): ts.SourceFile =>
  ts.createSourceFile(
    "config.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

// Value-binding local name -> import ref (module + export), and the local names
// a `plumix` factory export was imported under (canonical or aliased). Shared by
// the `blocks`-field and `registerBlock`-call extractors.
function buildImportMaps(sf: ts.SourceFile): {
  importOf: Map<string, BlockModuleRef>;
  factoryLocals: Set<string>;
} {
  const importOf = new Map<string, BlockModuleRef>();
  const factoryLocals = new Set<string>();
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImport(statement, importOf, factoryLocals);
    }
  }
  return { importOf, factoryLocals };
}

export function extractBlockModules(source: string): BlockModuleResult {
  const sf = parse(source);
  const { importOf, factoryLocals } = buildImportMaps(sf);

  // Outermost factory calls only — a call nested inside another factory's
  // arguments (e.g. `definePlugin(...)` inside a theme config) is not the
  // module's own config and must not clobber it.
  const topLevelCalls: ts.CallExpression[] = [];
  const walk = (node: ts.Node, insideFactory: boolean): void => {
    const isFactory =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      factoryLocals.has(node.expression.text);
    if (isFactory && !insideFactory) topLevelCalls.push(node);
    ts.forEachChild(node, (child) => walk(child, insideFactory || isFactory));
  };
  walk(sf, false);

  // Scan every argument for the config object literal: `defineTheme({…})` puts
  // it first, `definePlugin(id, {…})` second, `definePlugin(id, setup, {…})`
  // third. The id string and setup function are skipped as non-objects.
  for (const call of topLevelCalls) {
    for (const arg of call.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      const blocksProp = arg.properties.find((p) => propKey(p) === "blocks");
      if (blocksProp) return resolveBlocksProp(blocksProp, importOf);
    }
  }
  return { ok: true, modules: [] };
}

function collectImport(
  node: ts.ImportDeclaration,
  importOf: Map<string, BlockModuleRef>,
  factoryLocals: Set<string>,
): void {
  const clause = node.importClause;
  if (
    !clause ||
    clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
    !ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return; // side-effect or `import type` — no runtime value binding
  }
  const spec = node.moduleSpecifier.text;
  if (clause.name) {
    importOf.set(clause.name.text, { module: spec, exportName: "default" });
  }

  // A namespace import (`import * as x`) binds a module object, never a
  // `BlockSpec[]`, so it's intentionally not recorded — a `blocks` field using
  // one is then rejected rather than emitted as a crashing import.
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const imported = (element.propertyName ?? element.name).text;
      // A string-literal import name (`import { "weird-name" as x }`, an ES2022
      // arbitrary module export) can't be regenerated as `import { <name> as … }`
      // — skip it rather than emit a broken import statement.
      if (!JS_IDENTIFIER.test(imported)) continue;
      importOf.set(element.name.text, { module: spec, exportName: imported });
      if (isPlumixSpecifier(spec) && FACTORY_EXPORTS.has(imported)) {
        factoryLocals.add(element.name.text);
      }
    }
  }
}

const JS_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function resolveBlocksProp(
  prop: ts.ObjectLiteralElementLike,
  importOf: ReadonlyMap<string, BlockModuleRef>,
): BlockModuleResult {
  // `{ blocks }` shorthand, or `{ blocks: <expr> }` / `{ "blocks": <expr> }`.
  let value: ts.Expression | undefined;
  if (ts.isShorthandPropertyAssignment(prop)) value = prop.name;
  else if (ts.isPropertyAssignment(prop)) value = prop.initializer;
  return value ? resolveValue(value, importOf) : NOT_IMPORTED;
}

function resolveValue(
  value: ts.Expression,
  importOf: ReadonlyMap<string, BlockModuleRef>,
): BlockModuleResult {
  // `blocks` / `blocks: someImport`
  if (ts.isIdentifier(value)) {
    const ref = importOf.get(value.text);
    return ref ? { ok: true, modules: [ref] } : NOT_IMPORTED;
  }

  // `blocks: [...a, ...b]` or `blocks: [a, b]` — each element an imported binding.
  if (ts.isArrayLiteralExpression(value)) {
    const modules: BlockModuleRef[] = [];
    for (const element of value.elements) {
      const ident = ts.isSpreadElement(element) ? element.expression : element;
      if (!ts.isIdentifier(ident)) return NOT_IMPORTED;
      const ref = importOf.get(ident.text);
      if (!ref) return NOT_IMPORTED;
      modules.push(ref);
    }
    return { ok: true, modules };
  }

  return NOT_IMPORTED;
}

const propKey = (p: ts.ObjectLiteralElementLike): string | undefined =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : undefined;
