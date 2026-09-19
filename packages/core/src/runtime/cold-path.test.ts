import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

import {
  importsOf,
  resolveWithinCore,
  staticClosureOf,
} from "../test/import-graph.js";

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
//
// `app.ts` holds a whole-statement `import type` to each of them for its own
// signatures; rewriting one into a value import is the regression this file
// exists to catch. That distinction lives in `importsOf` — see the note there
// on why an inline `type` specifier still counts as a link.
const DEFERRED = [
  { importer: "runtime/app.ts", specifier: "../mcp/dispatch.js" },
  { importer: "runtime/app.ts", specifier: "../rest/build-handler.js" },
  { importer: "runtime/app.ts", specifier: "../rpc/build-handler.js" },
  { importer: "runtime/dispatcher.ts", specifier: "../auth/flow-routes.js" },
] as const;

const SRC = path.resolve(import.meta.dirname, "..");

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
// its SigV4 signer, the Cloudflare CDN provider — so a bundle that never
// imports the subpath never carries them. The root barrel is the entry here,
// not the cold path: the property is that no public export reaches them,
// whatever a bundler later shakes.
const SUBPATH_ONLY = [
  "cdn/cloudflare/index.ts",
  "db/libsql.ts",
  "storage/s3/index.ts",
  "storage/s3/sigv4.ts",
] as const;
const BARREL = staticClosureOf([path.join(SRC, "index.ts")]);

// A renamed module would pass for the wrong reason, so pin that it exists.
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

// `@plumix/core/support` is what `plumix/support` promises an admin chunk or an
// island can import. The ambient stores import `node:async_hooks`, which a
// browser bundle cannot resolve, so one static edge into them from a helper
// breaks every bundle that takes the subpath.
describe("the support entry stays browser-safe", () => {
  test("never reaches the ambient stores", () => {
    expectUnreachable(
      staticClosureOf([path.join(SRC, "support.ts")]),
      "context/stores.ts",
    );
  });
});

// `cli/raw-migrations.ts` is loaded by every `plumix migrate generate`, and all
// it wants from the change feed is a pair of `readonly string[]` constants.
// While those lived beside the feed's drizzle-backed helpers, asking for two
// strings cost 255ms against 1ms for the errors module sitting next to it.
//
// Rooted at the `cli` barrel rather than that one file: the barrel re-exports
// it, `importsOf` counts `export … from` as static, and the 218ms this is
// guarding was measured there.
const CLI_GRAPH = staticClosureOf([path.join(SRC, "cli/index.ts")]);

// The whole subtree, not `db/index.ts` alone. DDL naturally wants column names,
// so a later `import { entries } from "../db/schema/entries.js"` is the likely
// regression — and at ~240ms it is dearer than the import that prompted this.
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

// `cdn/decision.ts` answers one question per response — may this go into
// shared storage — and all it wants from the access layer is one routing
// string. While that string lived beside `access/policy.ts`'s role resolution,
// asking for it cost 273ms; it is now 1ms.
//
// Not yet load-bearing for a runtime adapter: cloudflare's `edge.ts` still
// reaches `responseAllowsSharedStorage` through the bare `plumix` barrel and
// pays for it regardless. This pins the precondition for the subpath that would
// fix that. Rooting a closure at `edge.ts` instead would pass vacuously —
// `resolveWithinCore` treats a bare specifier as a leaf.
const CDN_DECISION = staticClosureOf([path.join(SRC, "cdn/decision.ts")]);

describe("the cdn decision stays off the query layer", () => {
  test("the db subtree is absent from the decision closure", () => {
    expect(DB_MODULES.length).toBeGreaterThan(0);
    for (const file of DB_MODULES) expectUnreachable(CDN_DECISION, file);
  });
});
