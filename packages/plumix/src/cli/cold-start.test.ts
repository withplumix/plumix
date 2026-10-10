import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * Everything the entry reaches statically runs on every `plumix` invocation.
 * Core's root barrel costs ~500ms against ~4ms for its `cli` subpath.
 */
const CLI = import.meta.dirname;
const BARREL = "@plumix/core";
const ENTRY = path.join(CLI, "index.ts");

/**
 * Under `verbatimModuleSyntax` an inline `type` specifier still emits
 * `import {} from "…"`, so only a whole-statement `import type` is erased.
 */
function importsOf(file: string): {
  readonly runtime: readonly string[];
  readonly dynamic: readonly string[];
} {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
  );
  const runtime = source.statements.flatMap((statement) => {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
    ) {
      return [statement.moduleSpecifier.text];
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !statement.isTypeOnly
    ) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });

  const dynamic: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteral(specifier))
        dynamic.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return { runtime, dynamic };
}

/**
 * Follows the graph because the cost can arrive from outside `src/cli/`.
 * Tracks importers so a failure names the chain.
 */
function reachesBarrel(entry: string): string | undefined {
  const importedBy = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  let file: string | undefined;
  while ((file = queue.shift()) !== undefined) {
    for (const specifier of importsOf(file).runtime) {
      if (specifier === BARREL) {
        const chain: string[] = [];
        for (let step: string | undefined = file; step !== undefined;) {
          chain.unshift(path.relative(CLI, step));
          step = importedBy.get(step);
        }
        return [...chain, BARREL].join(" → ");
      }
      const resolved = resolveLocal(file, specifier);
      if (resolved !== undefined && !importedBy.has(resolved)) {
        importedBy.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return undefined;
}

/**
 * Only a relative specifier re-enters this package's own graph; a bare one is a
 * leaf as far as this walk is concerned.
 */
function resolveLocal(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(from), specifier).replace(/\.js$/, "");
  return [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    (candidate) => fs.existsSync(candidate),
  );
}

describe("the CLI entry stays off core's root barrel", () => {
  test("nothing the entry reaches imports the barrel at runtime", () => {
    expect(fs.existsSync(ENTRY)).toBe(true);
    expect(reachesBarrel(ENTRY)).toBeUndefined();
  });

  test("buildApp stays behind a dynamic import", () => {
    // The test above passes either way: the barrel is off the static imports
    // whether it is deferred or the call has gone entirely.
    expect(importsOf(ENTRY).dynamic).toContain(BARREL);
  });
});

describe("the run guard stays off the CLI's cold path", () => {
  test("cron reaches the barrel dynamically, not statically", () => {
    // The entry walk catches this too; this names the file so a failure
    // points at the line.
    const { runtime, dynamic } = importsOf(
      path.join(CLI, "commands", "cron.ts"),
    );
    expect(runtime).not.toContain(BARREL);
    expect(dynamic).toContain(BARREL);
  });
});
