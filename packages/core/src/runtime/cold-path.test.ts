import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

import {
  importsOf,
  resolveWithinCore,
  staticClosureOf,
} from "../test/import-graph.js";

/**
 * Not the root barrel: core is `sideEffects: false`, so a re-export costs a
 * render nothing until something executed reaches it.
 */
const COLD_PATH_ENTRIES = ["runtime/app.ts", "runtime/dispatcher.ts"] as const;

/**
 * Heavy graphs a public render must never pay for. Core ships unbundled `tsc`
 * output, so only the absence of a static import keeps them out.
 */
const DEFERRED = [
  { importer: "runtime/app.ts", specifier: "../mcp/dispatch.js" },
  { importer: "runtime/app.ts", specifier: "../rest/build-handler.js" },
  { importer: "runtime/app.ts", specifier: "../rpc/build-handler.js" },
  { importer: "runtime/dispatcher.ts", specifier: "../auth/flow-routes.js" },
] as const;

const SRC = path.resolve(import.meta.dirname, "..");

const ENTRY_FILES = COLD_PATH_ENTRIES.map((entry) => path.join(SRC, entry));
const COLD_PATH = staticClosureOf(ENTRY_FILES);

/**
 * Discovered rather than listed, so a loader added later is guarded the day
 * it lands.
 */
const DEFERRED_FILES = ENTRY_FILES.flatMap((entry) =>
  importsOf(entry).dynamic.flatMap((specifier) => {
    const file = resolveWithinCore(entry, specifier);
    return file === undefined ? [] : [{ specifier, file }];
  }),
);

/**
 * Returns the chain rather than a boolean so a failure names the import to
 * delete instead of forcing a hand search.
 */
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
  // Losing a loader shrinks the discovered set silently, so the roster pins
  // each; the discovered set carries the reachability half.
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

/**
 * Published only behind a subpath, so the property is that no public export
 * reaches them, whatever a bundler later shakes.
 */
const SUBPATH_ONLY = [
  "cdn/cloudflare/index.ts",
  "db/libsql.ts",
  "storage/s3/index.ts",
  "storage/s3/sigv4.ts",
] as const;
const BARREL = staticClosureOf([path.join(SRC, "index.ts")]);

/** A renamed module would pass for the wrong reason, so pin that it exists. */
function expectUnreachable(
  closure: ReadonlyMap<string, string | undefined>,
  file: string,
): void {
  expect(fs.existsSync(path.join(SRC, file))).toBe(true);
  expect(staticImportChain(closure, path.join(SRC, file))).toBeUndefined();
}

describe("subpath-only modules stay off the root barrel", () => {
  test.each(SUBPATH_ONLY)(
    "%s is absent from the barrel's static closure",
    (file) => {
      expectUnreachable(BARREL, file);
    },
  );
});

/**
 * The `cli` barrel is loaded by every `plumix` command. Reaching the query
 * layer from it once cost 218ms, against 1ms for the errors module beside it.
 */
const CLI_GRAPH = staticClosureOf([path.join(SRC, "cli/index.ts")]);

/**
 * The whole subtree, since DDL naturally wants column names and a schema
 * import is the likely regression.
 */
const DB_MODULES = fs
  .readdirSync(path.join(SRC, "db"), { recursive: true })
  .map(String)
  .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
  .map((entry) => path.join("db", entry));

describe("the CLI's SQL helpers stay off the query layer", () => {
  test("the db subtree is absent from the cli closure", () => {
    expect(DB_MODULES.length).toBeGreaterThan(0);
    for (const file of DB_MODULES) expectUnreachable(CLI_GRAPH, file);
  });
});

/**
 * Rooted at `cdn/decision.ts`, not cloudflare's `edge.ts`, because
 * `resolveWithinCore` treats a bare specifier as a leaf and would pass
 * vacuously.
 */
const CDN_DECISION = staticClosureOf([path.join(SRC, "cdn/decision.ts")]);

describe("the cdn decision stays off the query layer", () => {
  test("the db subtree is absent from the decision closure", () => {
    expect(DB_MODULES.length).toBeGreaterThan(0);
    for (const file of DB_MODULES) expectUnreachable(CDN_DECISION, file);
  });
});
