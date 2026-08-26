import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

// The plugin's main entry — what a site pays for by installing it. The engine
// is reachable only through the `/takumi` subpath, and the default renderer
// reaches it through a dynamic import, so the wasm stays off this graph for
// every install that never renders a card.
const ENTRY = "index.ts";
const ENGINE = "takumi.ts";
const ENGINE_LOADER = "./takumi.js";

const SRC = import.meta.dirname;

// Only a whole-statement `import type` is erased. Under `verbatimModuleSyntax`
// an inline `import { type X }` keeps the statement and still loads the module,
// so it counts as static here.
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
 * Every file statically reachable from the entry, mapped to the file that
 * imported it, so a failure names the chain to go delete rather than only its
 * destination. Breadth-first, so the reported chain is the shortest one.
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
