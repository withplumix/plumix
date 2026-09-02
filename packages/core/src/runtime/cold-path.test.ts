import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

// A runtime adapter builds the app and then dispatches every request through
// it, so the graph a public render pays for is what these two modules reach
// between them. Rooting only at `app.ts` would miss what the dispatcher pulls
// in directly — the admin shell, the route renderer, the SEO handlers.
//
// Not the root barrel, even though that's what an adapter actually imports:
// core is `sideEffects: false`, so the barrel is tree-shaken and a module is
// only paid for once something executed reaches it. Rooting there would redden
// this file for a public re-export that costs a render nothing.
const COLD_PATH_ENTRIES = ["runtime/app.ts", "runtime/dispatcher.ts"] as const;

// The graphs deliberately held behind a dynamic import. Each pulls in a heavy
// dependency — the MCP SDK and tool registry, the `@orpc/openapi` generator,
// the RPC procedure graph, the webauthn/oslo/arctic auth stack — that a public
// render must never pay for. Core ships as unbundled `tsc` output, so within
// the executed graph nothing keeps them out of a consumer's main chunk except
// the absence of a static import somewhere above.
const DEFERRED = [
  { importer: "runtime/app.ts", specifier: "../mcp/dispatch.js" },
  { importer: "runtime/app.ts", specifier: "../rest/build-handler.js" },
  { importer: "runtime/app.ts", specifier: "../rpc/build-handler.js" },
  { importer: "runtime/dispatcher.ts", specifier: "../auth/flow-routes.js" },
] as const;

const SRC = path.resolve(import.meta.dirname, "..");

// Only a whole-statement `import type` is erased, and `app.ts` holds one to
// each deferred module for its own signatures; rewriting one into a value
// import is the regression this file exists to catch. Inline specifiers do not
// count as erased: under `verbatimModuleSyntax` TS keeps the statement and
// emits `import {} from "…"`, which still loads the module and drags its graph
// along. `import defer` counts as static too — a deferred module is linked.
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

// Only relative specifiers can re-enter core's own graph; a bare specifier is a
// leaf as far as this walk is concerned.
function resolveWithinCore(
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

// Maps each reachable file to the one that imported it, so a failure can name
// the chain instead of only the destination. Breadth-first, so that chain is
// the shortest one — the longest is rarely the one worth deleting.
function staticClosureOf(
  entries: readonly string[],
): ReadonlyMap<string, string | undefined> {
  const importedBy = new Map<string, string | undefined>(
    entries.map((entry) => [entry, undefined]),
  );
  const queue = [...entries];
  let file: string | undefined;
  while ((file = queue.shift()) !== undefined) {
    for (const specifier of importsOf(file).static) {
      const resolved = resolveWithinCore(file, specifier);
      if (resolved !== undefined && !importedBy.has(resolved)) {
        importedBy.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return importedBy;
}

const ENTRY_FILES = COLD_PATH_ENTRIES.map((entry) => path.join(SRC, entry));
const COLD_PATH = staticClosureOf(ENTRY_FILES);

// Every module the entry files defer, discovered rather than listed. A loader
// added later is guarded the day it lands, which the hand-written roster above
// can't promise — this repo has had roster drift before.
const DEFERRED_FILES = ENTRY_FILES.flatMap((entry) =>
  importsOf(entry).dynamic.flatMap((specifier) => {
    const file = resolveWithinCore(entry, specifier);
    return file === undefined ? [] : [{ specifier, file }];
  }),
);

// The chain that put `file` in the closure, entry first — or undefined when
// nothing static reaches it, which is the passing case. Returning the chain as
// the asserted value rather than a boolean means the failure names the import
// to go delete, which is otherwise a hand search across 200-odd files.
function staticImportChain(
  closure: ReadonlyMap<string, string | undefined>,
  file: string,
): string | undefined {
  if (!closure.has(file)) return undefined;
  const chain: string[] = [];
  let step: string | undefined = file;
  while (step !== undefined) {
    chain.unshift(path.relative(SRC, step));
    step = closure.get(step);
  }
  return chain.join(" → ");
}

describe("the cold-start path defers its heavy graphs", () => {
  // The roster and the discovered set assert opposite failures. Losing a loader
  // shrinks the discovered set silently, so the roster pins that each named one
  // still exists; a static import that defeats a loader is invisible to the
  // roster, so the discovered set carries the reachability half.
  test.each(DEFERRED)(
    "$importer still defers $specifier",
    ({ importer, specifier }) => {
      expect(importsOf(path.join(SRC, importer)).dynamic).toContain(specifier);
    },
  );

  test.each(DEFERRED_FILES)(
    "$specifier is absent from the static closure",
    ({ file }) => {
      expect(staticImportChain(COLD_PATH, file)).toBeUndefined();
    },
  );
});

// Modules published only behind a subpath — the libSQL driver, the S3 slot and
// its SigV4 signer — so a bundle that never imports the subpath never carries
// them. The root barrel is the entry here, not the cold path: the property is
// that no public export reaches them, whatever a bundler later shakes.
const SUBPATH_ONLY = [
  "db/libsql.ts",
  "storage/s3/index.ts",
  "storage/s3/sigv4.ts",
] as const;
const BARREL = staticClosureOf([path.join(SRC, "index.ts")]);

describe("subpath-only modules stay off the root barrel", () => {
  test.each(SUBPATH_ONLY)(
    "%s is absent from the barrel's static closure",
    (file) => {
      // A renamed module would pass for the wrong reason; pin that it exists.
      expect(fs.existsSync(path.join(SRC, file))).toBe(true);
      expect(staticImportChain(BARREL, path.join(SRC, file))).toBeUndefined();
    },
  );
});
