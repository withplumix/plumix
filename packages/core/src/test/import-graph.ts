import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

/**
 * Static reading of core's own import graph, for the suites that assert a
 * property of the graph rather than of a running program: what a cold start
 * pays for (`runtime/cold-path.test.ts`), which direction the dev debug
 * layers may import in (`dev/debug-layers.test.ts`), and whether core keeps
 * its layer table (`layers.test.ts`).
 *
 * Deliberately a source-text walk rather than a bundler or a loaded module.
 * Core ships as unbundled `tsc` output, so the only thing keeping a graph out
 * of a consumer's chunk is the absence of a static import in the text — which
 * is exactly what this reads. Loading the modules instead would answer a
 * different question and would run their side effects.
 *
 * The two callers mean different things by "an edge", so the split below is
 * three-way rather than two. A cost question counts what *links*, and a
 * type-only import links nothing. A direction question counts what the module
 * *names*: `import type` is still a dependency, and erasing it is the cheapest
 * way to point a layer back at one above it without any of this noticing.
 */
export interface FileImports {
  /** Specifiers that link the module at load: `import`, and `export … from`. */
  readonly static: readonly string[];
  /** Specifiers reached only through a call to `import()`. */
  readonly dynamic: readonly string[];
  /** Specifiers named by a whole-statement `import type` / `export type`. */
  readonly typeOnly: readonly string[];
}

/**
 * Only a whole-statement `import type` is erased. Inline specifiers do not
 * count: under `verbatimModuleSyntax` TS keeps the statement and emits
 * `import {} from "…"`, which still loads the module and drags its graph
 * along. `import defer` counts as static too — a deferred module is linked.
 */
function isErased(clause: ts.ImportClause | undefined): boolean {
  return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

/** Every specifier the file at `file` names, split by how it depends on it. */
export function importsOf(file: string): FileImports {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
  );
  const statics: string[] = [];
  const dynamics: string[] = [];
  const typeOnly: string[] = [];

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const bucket = isErased(statement.importClause) ? typeOnly : statics;
      bucket.push(statement.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const bucket = statement.isTypeOnly ? typeOnly : statics;
      bucket.push(statement.moduleSpecifier.text);
    }
  }

  function collectDynamic(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteral(specifier)) {
        dynamics.push(specifier.text);
      }
    }
    ts.forEachChild(node, collectDynamic);
  }
  collectDynamic(source);

  return { static: statics, dynamic: dynamics, typeOnly };
}

/**
 * The file a specifier names, or undefined when it leaves core. Only relative
 * specifiers can re-enter core's own graph; a bare specifier is a leaf as far
 * as these walks are concerned.
 */
export function resolveWithinCore(
  from: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(from), specifier).replace(/\.js$/, "");
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

type EdgeKind = "static" | "dynamic" | "typeOnly";

export interface ImportEdge {
  readonly to: string;
  readonly kind: EdgeKind;
}

/** The edges out of `file` that land back inside core, resolved to files. */
export function edgesOf(file: string): readonly ImportEdge[] {
  const imports = importsOf(file);
  const kinds = ["static", "dynamic", "typeOnly"] as const;
  return kinds.flatMap((kind) =>
    imports[kind].flatMap((specifier) => {
      const to = resolveWithinCore(file, specifier);
      return to === undefined ? [] : [{ to, kind }];
    }),
  );
}

/**
 * Maps each file reachable from `entries` through `next` to the one that
 * reached it, so a failure can name the chain instead of only the
 * destination. Breadth-first, so that chain is the shortest one — the longest
 * is rarely the one worth deleting.
 */
export function closureOf(
  entries: readonly string[],
  next: (file: string) => readonly string[],
): ReadonlyMap<string, string | undefined> {
  const importedBy = new Map<string, string | undefined>(
    entries.map((entry) => [entry, undefined]),
  );
  const queue = [...entries];
  let file: string | undefined;
  while ((file = queue.shift()) !== undefined) {
    for (const reached of next(file)) {
      if (!importedBy.has(reached)) {
        importedBy.set(reached, file);
        queue.push(reached);
      }
    }
  }
  return importedBy;
}

/**
 * The chain `closure` reached `file` by, entry first; undefined if it didn't.
 */
export function chainTo(
  closure: ReadonlyMap<string, string | undefined>,
  file: string,
): readonly string[] | undefined {
  if (!closure.has(file)) return undefined;
  const chain: string[] = [];
  let step: string | undefined = file;
  while (step !== undefined) {
    chain.unshift(step);
    step = closure.get(step);
  }
  return chain;
}

/** {@link closureOf} over static edges: what loading `entries` links. */
export function staticClosureOf(
  entries: readonly string[],
): ReadonlyMap<string, string | undefined> {
  return closureOf(entries, (file) =>
    edgesOf(file)
      .filter((edge) => edge.kind === "static")
      .map((edge) => edge.to),
  );
}

/**
 * The groups of `nodes` that all reach each other through `next` — each one a
 * cycle, or several sharing members. Groups of one are left out: a node
 * reaching itself is not a cycle between two of them. Tarjan's algorithm.
 */
export function cyclesAmong(
  nodes: readonly string[],
  next: (node: string) => readonly string[],
): readonly (readonly string[])[] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  function visit(node: string): void {
    index.set(node, index.size);
    low.set(node, index.get(node) ?? 0);
    stack.push(node);
    onStack.add(node);
    for (const reached of next(node)) {
      if (!index.has(reached)) {
        visit(reached);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(reached) ?? 0));
      } else if (onStack.has(reached)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(reached) ?? 0));
      }
    }
    if (low.get(node) !== index.get(node)) return;
    const group: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      group.push(member);
    } while (member !== node);
    if (group.length > 1) cycles.push(group.sort());
  }

  for (const node of nodes) if (!index.has(node)) visit(node);
  return cycles;
}

/** Every `.ts`/`.tsx` under `dir`, absolute and recursive, tests included. */
export function sourceFilesUnder(dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => path.join(dir, entry));
}
