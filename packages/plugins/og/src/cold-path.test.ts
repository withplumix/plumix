import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * The engine is reachable only via `/takumi` and a dynamic import, so the wasm
 * stays off this graph for installs that never render a card.
 */
const ENTRY = "index.ts";
const ENGINE = "takumi.ts";
const ENGINE_LOADER = "./takumi.js";
/**
 * The developer surfaces — preview route and debug-bar panel. Reached only
 * through the `PLUMIX_DEV` branch's dynamic import, so a build drops the
 * branch and the whole module with it.
 */
const DEV = path.join("dev", "index.ts");
const DEV_LOADER = "./dev/index.js";

const SRC = import.meta.dirname;

/**
 * Only a whole-statement `import type` is erased. Under `verbatimModuleSyntax`
 * an inline `import { type X }` keeps the statement and still loads the module,
 * so it counts as static here.
 */
function isErased(clause: ts.ImportClause | undefined): boolean {
  return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

interface FileImports {
  readonly static: readonly string[];
  readonly dynamic: readonly string[];
}

function importsOf(file: string): FileImports {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
  );
  const statics: string[] = [];
  const dynamics: string[] = [];

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !isErased(statement.importClause)
    ) {
      statics.push(statement.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !statement.isTypeOnly
    ) {
      statics.push(statement.moduleSpecifier.text);
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

  return { static: statics, dynamic: dynamics };
}

function resolveWithinPackage(
  from: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(from), specifier).replace(/\.js$/, "");
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Maps each reachable file to its importer so a failure names the whole chain;
 * breadth-first, so the chain is the shortest.
 */
function staticClosure(entry: string): ReadonlyMap<string, string | undefined> {
  const importedBy = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  let file: string | undefined;
  while ((file = queue.shift()) !== undefined) {
    for (const specifier of importsOf(file).static) {
      const resolved = resolveWithinPackage(file, specifier);
      if (resolved !== undefined && !importedBy.has(resolved)) {
        importedBy.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return importedBy;
}

const CLOSURE = staticClosure(path.join(SRC, ENTRY));

function chainTo(file: string): string | undefined {
  if (!CLOSURE.has(file)) return undefined;
  const chain: string[] = [];
  let step: string | undefined = file;
  while (step !== undefined) {
    chain.unshift(path.relative(SRC, step));
    step = CLOSURE.get(step);
  }
  return chain.join(" → ");
}

describe("the engine stays off the default graph", () => {
  test("nothing the entry reaches statically imports the engine module", () => {
    expect(chainTo(path.join(SRC, ENGINE))).toBeUndefined();
  });

  test("nothing the entry reaches statically imports the wasm package", () => {
    const offenders = [...CLOSURE.keys()].filter((file) =>
      importsOf(file).static.some((specifier) =>
        specifier.startsWith("@takumi-rs/"),
      ),
    );
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  test("the default renderer still reaches the engine lazily", () => {
    const loaders = [...CLOSURE.keys()].filter((file) =>
      importsOf(file).dynamic.includes(ENGINE_LOADER),
    );
    expect(loaders.map((file) => path.relative(SRC, file))).not.toEqual([]);
  });
});

describe("the developer surfaces stay off the default graph", () => {
  test("nothing the entry reaches statically imports the dev module", () => {
    expect(chainTo(path.join(SRC, DEV))).toBeUndefined();
  });

  test("the entry still reaches the dev module lazily", () => {
    const loaders = [...CLOSURE.keys()].filter((file) =>
      importsOf(file).dynamic.includes(DEV_LOADER),
    );
    expect(loaders.map((file) => path.relative(SRC, file))).toEqual([ENTRY]);
  });
});
