import * as path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

import { baseConfig } from "@plumix/eslint-config/base";

import type { Layer } from "../layers.js";
import type { ImportEdge } from "./test/import-graph.js";
import { layerDirection } from "../eslint.config.js";
import {
  CLIENT_SUBPATHS,
  CYCLE_UNITS,
  environmentOf,
  FOLDERS,
  layerOf,
  LAYERS,
  TOP_FILES,
} from "../layers.js";
import packageJson from "../package.json" with { type: "json" };
import {
  chainTo,
  closureOf,
  cyclesAmong,
  edgesOf,
  importsOf,
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
  /** What to go and delete, printed when the violation occurs. */
  readonly detail: string;
}

// One line per violation, so a failure reads as the edge or cycle to remove.
function keyOf(violation: Violation): string {
  return violation.rule === "cycle"
    ? `cycle in ${violation.layer}: ${violation.members.join(", ")}`
    : `${violation.rule}: ${violation.from} → ${violation.to}`;
}

/** Each found violation, with its detail. */
function described(found: readonly Found[]): readonly string[] {
  return found.map(
    ({ violation, detail }) => `${keyOf(violation)} (${detail})`,
  );
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

// A top-level folder, or a root file on its own, or the unit it belongs to
// in its layer.
function subsystemOf(file: string): string {
  const [head, ...rest] = file.split("/");
  const subsystem = rest.length === 0 || head === undefined ? file : head;
  const layer = layerOf(file);
  const unit = Object.entries(CYCLE_UNITS).find(
    ([, { layer: unitLayer, members }]) =>
      unitLayer === layer && members.includes(subsystem),
  );
  return unit?.[0] ?? subsystem;
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

  test("a cycle inside a unit is allowed, one through it is named with the unit", () => {
    const graph: Graph = new Map<string, readonly ImportEdge[]>([
      ["context/a.ts", [{ to: "plugin/b.ts", kind: "typeOnly" }]],
      ["plugin/b.ts", [{ to: "context/a.ts", kind: "typeOnly" }]],
      ["hooks/c.ts", [{ to: "support.ts", kind: "typeOnly" }]],
      ["support.ts", [{ to: "theme.ts", kind: "typeOnly" }]],
    ]);
    expect(cycleViolations(graph)).toEqual([
      {
        violation: {
          rule: "cycle",
          layer: "contracts",
          members: ["app-context", "support.ts"],
        },
        detail:
          "app-context → support.ts → app-context, via hooks/c.ts → support.ts",
      },
    ]);
  });
});

describe("core keeps its layer table", () => {
  const found = environmentViolations(GRAPH, CLIENT_ENTRIES);

  test("no client entry reaches server-only code", () => {
    expect(described(found)).toEqual([]);
  });

  test("no same-layer cycle", () => {
    expect(described(cycleViolations(GRAPH))).toEqual([]);
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

// `plumix/runtime` hands these to every self-hosted runtime, and they sit on
// the request path, so they hold to what a Worker offers: Web APIs, no Node
// builtin anywhere in what they load.
describe("the self-hosted request rules stay Worker-compatible", () => {
  const RULES = [
    "runtime/request-trust.ts",
    "runtime/asset-path.ts",
    "runtime/drain.ts",
  ];

  test("nothing they load names a node: module", () => {
    const closure = closureOf(RULES, (file) => runtimeImports(GRAPH, file));
    const builtins = [...closure.keys()].flatMap((file) => {
      const { static: statics, dynamic } = importsOf(path.join(SRC, file));
      return [...statics, ...dynamic]
        .filter((specifier) => specifier.startsWith("node:"))
        .map((specifier) => `${file} → ${specifier}`);
    });
    expect(RULES.every((file) => GRAPH.has(file))).toBe(true);
    expect(builtins).toEqual([]);
  });
});

// Parse as core's own config does, minus the project service: a probe exists
// only as text, and direction needs no type information.
const PARSER = baseConfig.find((block) => block.languageOptions?.parser)
  ?.languageOptions?.parser;

function directionLinter(config = layerDirection()): ESLint {
  return new ESLint({
    cwd: path.dirname(SRC),
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts", "**/*.tsx"], languageOptions: { parser: PARSER } },
      ...config,
    ],
  });
}

const DIRECTION = directionLinter();

// The plugin names both files' categories, which here are their layers.
const DENIED =
  /^Dependencies to file of category "(\w+)" are not allowed in file of category "(\w+)"/;

/**
 * What linting `code` as the file at `file` reports: `line: from → to` for a
 * direction error, the rule and its message for anything else.
 */
async function lintAs(
  file: string,
  code: string,
  linter = DIRECTION,
): Promise<readonly string[]> {
  const [result] = await linter.lintText(code, {
    filePath: path.join(SRC, file),
  });
  return (result?.messages ?? []).map((message) => {
    const [, to, from] = DENIED.exec(message.message) ?? [];
    return message.ruleId === "boundaries/dependencies" && to !== undefined
      ? `${message.line}: ${from} → ${to}`
      : `${message.line}: ${message.ruleId ?? "fatal"}: ${message.message}`;
  });
}

describe("lint holds each file to its own layer or a lower one", () => {
  test("a capability importing a surface is an error", async () => {
    expect(
      await lintAs("entries/probe.ts", 'import { x } from "../rpc/base.js";'),
    ).toEqual(["1: capabilities → surfaces"]);
  });

  test("an erased import still counts", async () => {
    expect(
      await lintAs(
        "entries/probe.ts",
        'import type { X } from "../rpc/base.js";',
      ),
    ).toEqual(["1: capabilities → surfaces"]);
  });

  test("nothing below the composition root imports it", async () => {
    expect(
      await lintAs(
        "entries/probe.ts",
        'import { x } from "../context/app.js";',
      ),
    ).toEqual(["1: capabilities → top"]);
  });

  // `context/app.ts` is `top` though its folder is `contracts`, so a sibling
  // may not reach it either.
  test("a top file is classified before its folder", async () => {
    expect(
      await lintAs("context/probe.ts", 'import { x } from "./app.js";'),
    ).toEqual(["1: contracts → top"]);
  });

  test("top may import any layer", async () => {
    expect(
      await lintAs("context/app.ts", 'import { x } from "../rpc/base.js";'),
    ).toEqual([]);
  });

  test("a re-export and a dynamic import count", async () => {
    expect(
      await lintAs(
        "entries/probe.ts",
        [
          'export { x } from "../rpc/base.js";',
          'export const load = () => import("../rpc/base.js");',
        ].join("\n"),
      ),
    ).toEqual(["1: capabilities → surfaces", "2: capabilities → surfaces"]);
  });

  test("a `.js` specifier resolves to its `.tsx` source", async () => {
    expect(
      await lintAs(
        "entries/probe.ts",
        'import { x } from "../dev/ui/error-page.js";',
      ),
    ).toEqual(["1: capabilities → surfaces"]);
  });

  test("a test file and the test harness are not held to it", async () => {
    const upward = 'import { x } from "../context/app.js";';
    expect(await lintAs("entries/probe.test.ts", upward)).toEqual([]);
    expect(await lintAs("entries/probe.test.tsx", upward)).toEqual([]);
    expect(await lintAs("test/probe.ts", upward)).toEqual([]);
  });

  test("its own layer and the ones below are allowed", async () => {
    expect(
      await lintAs(
        "entries/probe.ts",
        [
          'import { x } from "./query.js";',
          'import { y } from "../db/index.js";',
          'import { z } from "../support.js";',
          'import { w } from "../json.js";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("moving a folder in the table moves what lint reports", async () => {
    const moved = directionLinter(
      layerDirection({
        folders: {
          ...FOLDERS,
          "entries/": { layer: "surfaces", environment: "server-only" },
        },
        topFiles: TOP_FILES,
      }),
    );
    expect(
      await lintAs(
        "entries/probe.ts",
        'import { x } from "../rpc/base.js";',
        moved,
      ),
    ).toEqual([]);
  });

  // The plugin picks the first descriptor that matches and the table the
  // deepest folder, so the generated order is the thing that could drift.
  // A probe importing the root entry names the layer lint put the file in.
  test("lint puts every production file in the table's layer", async () => {
    const disagreeing: string[] = [];
    for (const file of PRODUCTION_FILES) {
      const root = path.posix.relative(path.posix.dirname(file), "index.js");
      const layer = layerOf(file);
      const expected = layer === "top" ? [] : [`1: ${layer} → top`];
      const reported = await lintAs(
        file,
        `import { x } from "${root.startsWith(".") ? root : `./${root}`}";`,
      );
      if (reported.join() !== expected.join()) {
        disagreeing.push(`${file}: ${reported.join() || "top"}`);
      }
    }
    expect(disagreeing).toEqual([]);
  });
});
