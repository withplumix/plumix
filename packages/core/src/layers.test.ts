import * as path from "node:path";
import { describe, expect, test } from "vitest";

import type { Layer } from "../layers.js";
import type { ImportEdge } from "./test/import-graph.js";
import baseline from "../layers.baseline.json" with { type: "json" };
import { CLIENT_SUBPATHS, environmentOf, layerOf, LAYERS } from "../layers.js";
import packageJson from "../package.json" with { type: "json" };
import {
  chainTo,
  closureOf,
  cyclesAmong,
  edgesOf,
  sourceFilesUnder,
} from "./test/import-graph.js";

const SRC = import.meta.dirname;

// Posix, relative to `src/` — the form the table's keys are written in.
function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}

const PRODUCTION_FILES = sourceFilesUnder(SRC)
  .map(relative)
  .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith("test/"))
  .sort();

function unassigned(files: readonly string[]): readonly string[] {
  return files.filter((file) => layerOf(file) === undefined);
}

describe("every production file has a layer", () => {
  test("a file in a folder the table does not cover is named", () => {
    expect(unassigned(["db/client.ts", "brand-new/thing.ts"])).toEqual([
      "brand-new/thing.ts",
    ]);
  });

  test("core's own source is fully assigned", () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(0);
    expect(unassigned(PRODUCTION_FILES)).toEqual([]);
  });
});

// Every production file's resolved imports, keyed and pointing by path under
// `src/`. Read once: the rules below walk it many times.
type Graph = ReadonlyMap<string, readonly ImportEdge[]>;

const GRAPH: Graph = new Map(
  PRODUCTION_FILES.map((file) => [
    file,
    edgesOf(path.join(SRC, file)).map((edge) => ({
      to: relative(edge.to),
      kind: edge.kind,
    })),
  ]),
);

interface EnvironmentViolation {
  readonly rule: "environment";
  /** The client entry whose runtime closure carries `to`. */
  readonly from: string;
  readonly to: string;
}

interface CycleViolation {
  readonly rule: "cycle";
  readonly layer: Layer;
  /** The subsystems that all reach each other, sorted. */
  readonly members: readonly string[];
}

type Violation = EnvironmentViolation | CycleViolation;

interface Found<V extends Violation = Violation> {
  readonly violation: V;
  /** What to go and delete, printed when the violation is not baselined. */
  readonly detail: string;
}

// One line per violation, so the baseline compares as a set of strings and a
// failure reads as the entry to add or remove.
function keyOf(violation: Violation): string {
  return violation.rule === "cycle"
    ? `cycle in ${violation.layer}: ${violation.members.join(", ")}`
    : `${violation.rule}: ${violation.from} → ${violation.to}`;
}

const BASELINE = new Set((baseline as readonly Violation[]).map(keyOf));

/** Found violations the baseline doesn't list, each with its detail. */
function unexpected(
  found: readonly Found[],
  known: ReadonlySet<string>,
): readonly string[] {
  return found
    .filter(({ violation }) => !known.has(keyOf(violation)))
    .map(({ violation, detail }) => `${keyOf(violation)} (${detail})`);
}

/** Baseline entries none of the found violations match. */
function stale(
  found: readonly Found[],
  known: ReadonlySet<string>,
): readonly string[] {
  const occurring = new Set(found.map(({ violation }) => keyOf(violation)));
  return [...known].filter((key) => !occurring.has(key));
}

// Static and dynamic edges both ship: a lazy chunk is still in the bundle.
// A whole-statement `import type` is erased and ships nothing.
function runtimeImports(graph: Graph, file: string): readonly string[] {
  return (graph.get(file) ?? [])
    .filter((edge) => edge.kind !== "typeOnly")
    .map((edge) => edge.to);
}

function environmentViolations(
  graph: Graph,
  entries: readonly string[],
): readonly Found<EnvironmentViolation>[] {
  return entries.flatMap((entry) => {
    const closure = closureOf([entry], (file) => runtimeImports(graph, file));
    return [...closure.keys()]
      .filter((file) => environmentOf(file) === "server-only")
      .map((file) => ({
        violation: { rule: "environment", from: entry, to: file },
        detail: (chainTo(closure, file) ?? []).join(" → "),
      }));
  });
}

// A top-level folder, or a root file on its own.
function subsystemOf(file: string): string {
  const [head, ...rest] = file.split("/");
  return rest.length === 0 || head === undefined ? file : head;
}

// Every edge kind counts here, type-only included: a cycle erased from the
// emitted code is still two subsystems that can't be understood apart.
function cycleViolations(graph: Graph): readonly Found<CycleViolation>[] {
  return LAYERS.flatMap((layer) => {
    // subsystem → subsystem it imports → one file edge that does it
    const edges = new Map<string, Map<string, string>>();
    for (const [file, out] of graph) {
      if (layerOf(file) !== layer) continue;
      const from = subsystemOf(file);
      const targets = edges.get(from) ?? new Map<string, string>();
      edges.set(from, targets);
      for (const { to: target } of out) {
        const to = subsystemOf(target);
        if (layerOf(target) !== layer || to === from || targets.has(to)) {
          continue;
        }
        targets.set(to, `${file} → ${target}`);
      }
    }
    const next = (node: string): readonly string[] => [
      ...(edges.get(node)?.keys() ?? []),
    ];
    return cyclesAmong([...edges.keys()], next).map((members) => {
      const [start = ""] = members;
      const inCycle = (node: string): readonly string[] =>
        next(node).filter((to) => members.includes(to));
      const closure = closureOf([start], inCycle);
      const last = members.find((node) => inCycle(node).includes(start));
      const loop = [...(chainTo(closure, last ?? start) ?? []), start];
      const via = edges.get(start)?.get(loop[1] ?? "") ?? "";
      return {
        violation: { rule: "cycle", layer, members },
        detail: `${loop.join(" → ")}, via ${via}`,
      };
    });
  });
}

const EXPORTS = new Map(
  Object.entries(packageJson.exports).map(([subpath, target]) => [
    subpath,
    target.default,
  ]),
);

// `./dist/foo.js` in the `exports` map is `src/foo.ts` or `src/foo.tsx`.
function sourceOfSubpath(subpath: string): string {
  const target = EXPORTS.get(subpath);
  if (target === undefined) throw new Error(`no export ${subpath}`);
  const base = target.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
  const file = [`${base}.ts`, `${base}.tsx`].find((candidate) =>
    GRAPH.has(candidate),
  );
  if (file === undefined) throw new Error(`no source for ${subpath}`);
  return file;
}

const CLIENT_ENTRIES = CLIENT_SUBPATHS.map(sourceOfSubpath);

describe("nothing a client entry runs reaches server-only code", () => {
  test("a runtime import into a server-only folder is found, with its chain", () => {
    const graph: Graph = new Map([
      [
        "support.ts",
        [
          { to: "json.ts", kind: "static" },
          { to: "context/stores.ts", kind: "typeOnly" },
        ],
      ],
      ["json.ts", [{ to: "db/client.ts", kind: "dynamic" }]],
    ]);
    expect(environmentViolations(graph, ["support.ts"])).toEqual([
      {
        violation: {
          rule: "environment",
          from: "support.ts",
          to: "db/client.ts",
        },
        detail: "support.ts → json.ts → db/client.ts",
      },
    ]);
  });
});

describe("the subsystems inside a layer form no cycle", () => {
  test("a same-layer back-edge is named with its cycle and one edge", () => {
    const graph: Graph = new Map<string, readonly ImportEdge[]>([
      ["entries/a.ts", [{ to: "terms/b.ts", kind: "static" }]],
      // Type-only still counts: erasing an import doesn't undo the dependency.
      ["terms/b.ts", [{ to: "entries/c.ts", kind: "typeOnly" }]],
      // A cycle through another layer is the direction rule's business.
      ["users/d.ts", [{ to: "rpc/e.ts", kind: "static" }]],
      ["rpc/e.ts", [{ to: "users/d.ts", kind: "static" }]],
    ]);
    expect(cycleViolations(graph)).toEqual([
      {
        violation: {
          rule: "cycle",
          layer: "capabilities",
          members: ["entries", "terms"],
        },
        detail: "entries → terms → entries, via entries/a.ts → terms/b.ts",
      },
    ]);
  });
});

describe("the baseline only shrinks", () => {
  test("an entry that no longer occurs is stale", () => {
    const fixed = "environment: support.ts → db/client.ts";
    const standing = "environment: support.ts → rpc/x.ts";
    const found: readonly Found[] = [
      {
        violation: { rule: "environment", from: "support.ts", to: "rpc/x.ts" },
        detail: "support.ts → rpc/x.ts",
      },
    ];
    expect(stale(found, new Set([fixed, standing]))).toEqual([fixed]);
  });
});

describe("core keeps its layer table, less the baselined violations", () => {
  const found = environmentViolations(GRAPH, CLIENT_ENTRIES);
  const cycles = cycleViolations(GRAPH);

  test("no environment violation beyond the baseline", () => {
    expect(unexpected(found, BASELINE)).toEqual([]);
  });

  test("no same-layer cycle beyond the baseline", () => {
    expect(unexpected(cycles, BASELINE)).toEqual([]);
  });

  // A fixed violation must take its entry with it, or the entry would quietly
  // re-admit the same violation later.
  test("every baseline entry still occurs", () => {
    expect(stale([...found, ...cycles], BASELINE)).toEqual([]);
  });

  // `@plumix/core/support` is what `plumix/support` promises an admin chunk
  // or an island can import. The ambient stores import `node:async_hooks`,
  // which a browser bundle cannot resolve, so one static edge into them from a
  // helper breaks every bundle that takes the subpath.
  test("the support entry never reaches the ambient stores", () => {
    expect(environmentOf("context/stores.ts")).toBe("server-only");
    expect(CLIENT_ENTRIES).toContain("support.ts");
    expect(found.map(({ violation }) => keyOf(violation))).not.toContain(
      "environment: support.ts → context/stores.ts",
    );
  });
});
