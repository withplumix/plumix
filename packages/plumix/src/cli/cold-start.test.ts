import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

// `bin/plumix.mjs` imports this directory's entry, so whatever it reaches
// statically is evaluated by every `plumix` invocation before argv is even
// parsed. Core's root barrel costs ~500ms to evaluate against ~4ms for its
// `cli` subpath, and the one symbol the CLI wants from the barrel — `buildApp`
// — is never called by a command that opts out through `deferApp`.
const CLI = import.meta.dirname;
const BARREL = "@plumix/core";
const ENTRY = path.join(CLI, "index.ts");

// Only a whole-statement `import type` is erased. Under `verbatimModuleSyntax`
// an inline `type` specifier still emits `import {} from "…"`, which loads the
// module and drags its graph along — so that shape has to count as runtime, and
// so does a re-export, which is how `kit.ts` reaches core at all.
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

// Following the graph rather than scanning `src/cli/`, because the cost can
// arrive from outside it: `../vite/index.ts` imports the barrel at runtime, and
// one CLI module reaching for it would put ~500ms back with every file in this
// directory still clean. Maps each file to its importer so a failure names the
// chain instead of only the destination.
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

// Only a relative specifier re-enters this package's own graph; a bare one is a
// leaf as far as this walk is concerned.
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
