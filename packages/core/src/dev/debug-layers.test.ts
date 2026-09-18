import * as path from "node:path";
import { describe, expect, test } from "vitest";

import {
  importsOf,
  resolveWithinCore,
  sourceFilesUnder,
  staticClosureOf,
} from "../test/import-graph.js";

// The dev debug feature is three layers, and the only thing that keeps them
// three is that imports run one way: a surface reads the panel vocabulary,
// which reads the captured request, and never the reverse. Nothing in the
// compiler complains about a cycle between sibling directories — TypeScript
// resolves one happily — so the direction is a property only a test can hold.
//
// This is why the store and the writer left `debug-bar/`: the bar is one of
// four readers (itself, the read routes, and the two MCP tools), and while it
// owned the directory, every new reader had to import out of a UI widget to
// reach the data (#2422).
//
// Scope is the debug cluster only, and only edges *inside* it. `dev/server/`
// (the dev error page, which has its own unrelated `panels/`), `dev/ui/` and
// `dev/trust.ts` are not part of the cluster and are deliberately absent
// below. Nor is a rule here aimed at `context/app.ts`, which registers both
// the bar's telemetry consumer and the history writer: a composition root
// naming every unit is what a composition root is for, and forbidding it
// would only push the wiring somewhere less visible.
const UNIT_NAMES = ["capture", "panels", "bar", "routes"] as const;
type UnitName = (typeof UNIT_NAMES)[number];

interface Unit {
  /**
   * Path under `src/`, with no extension and no trailing slash. It names
   * either a directory or a single module, and {@link unitOf} decides which
   * structurally — `dev/debug-bar` must not end up claiming
   * `dev/debug-bar-config.ts`, and a prefix match alone would.
   */
  readonly base: string;
  /** The other units it may name. Its own files are always allowed. */
  readonly mayImport: readonly UnitName[];
}

const UNITS: Readonly<Record<UnitName, Unit>> = {
  capture: { base: "dev/request-history", mayImport: [] },
  // Owns `dev.panels` as well as the panels themselves: both surfaces resolve
  // the setting from here, which is what lets the leaf that used to hold it
  // disappear rather than be relocated (#2425).
  panels: { base: "dev/debug-panels", mayImport: ["capture"] },
  // Two surfaces. Same rank, and they must not import each other either: the
  // bar's switcher reaches the read routes over HTTP, and a direct import
  // would quietly delete that seam.
  bar: { base: "dev/debug-bar", mayImport: ["capture", "panels"] },
  routes: {
    base: "dev/history-routes",
    mayImport: ["capture", "panels"],
  },
};

const SRC = path.resolve(import.meta.dirname, "..");

const DEV_FILES = sourceFilesUnder(path.join(SRC, "dev"));

function unitOf(file: string): UnitName | undefined {
  // Posix-normalized: on Windows `path.relative` yields `\`, every base would
  // miss, and every rule below would pass by matching nothing.
  const relative = path.relative(SRC, file).split(path.sep).join("/");
  return UNIT_NAMES.find((name) => {
    const { base } = UNITS[name];
    const inDirectory = relative.startsWith(`${base}/`);
    const isModule = relative === `${base}.ts` || relative === `${base}.tsx`;
    const isModuleTest =
      relative === `${base}.test.ts` || relative === `${base}.test.tsx`;
    return inDirectory || isModule || isModuleTest;
  });
}

function filesOf(name: UnitName): readonly string[] {
  return DEV_FILES.filter((file) => unitOf(file) === name);
}

interface CrossUnitEdge {
  /** `importer → imported`, both relative to `src/`, for the failure message. */
  readonly label: string;
  readonly target: UnitName;
}

/** Every edge out of `file` that lands in a different unit of the cluster. */
function crossUnitEdges(file: string): readonly CrossUnitEdge[] {
  const { static: statics, dynamic, typeOnly } = importsOf(file);
  // All three kinds count here. A dynamic import is still a dependency —
  // deferring a module does not undo a cycle, it only moves when it links —
  // and so is a type-only one, which is the kind that leaves no trace at all
  // in the emitted graph and would otherwise walk straight past this test.
  return [...statics, ...dynamic, ...typeOnly].flatMap((specifier) => {
    const resolved = resolveWithinCore(file, specifier);
    if (resolved === undefined) return [];
    const target = unitOf(resolved);
    if (target === undefined || target === unitOf(file)) return [];
    const label = `${path.relative(SRC, file)} → ${path.relative(SRC, resolved)}`;
    return [{ label, target }];
  });
}

describe("the dev debug layers import one way", () => {
  // A renamed or emptied directory would satisfy every rule below by having
  // no files to break them, so pin that each unit is really there first.
  test.each(UNIT_NAMES)("%s exists and has modules", (name) => {
    expect(filesOf(name).length).toBeGreaterThan(0);
  });

  test.each(UNIT_NAMES)("%s imports only what it may", (name) => {
    const allowed = new Set<UnitName>(UNITS[name].mayImport);
    const violations = filesOf(name)
      .flatMap(crossUnitEdges)
      .filter((edge) => !allowed.has(edge.target))
      .map((edge) => edge.label);
    expect(violations).toEqual([]);
  });
});

// The two dev MCP tools are the readers that prove the point: they want the
// captured requests and nothing else. While the store lived in `debug-bar/`,
// asking for it meant importing a React overlay's directory into the MCP tool
// registry — the panel graph travelled with it, held out of production only by
// the dev gate above.
const MCP_READERS = ["mcp/telemetry-tools.ts", "mcp/error-tools.ts"] as const;

describe("the dev MCP tools read the capture layer only", () => {
  // The whole reachable graph, not the tool's own import list: a reach that
  // goes through `mcp/tool.js` or any other intermediate costs the same and
  // would pass a one-level check.
  test.each(MCP_READERS)("%s reaches no panel or surface module", (reader) => {
    const closure = staticClosureOf([path.join(SRC, reader)]);
    const reached = [...closure.keys()]
      .filter((file) => {
        const unit = unitOf(file);
        return unit !== undefined && unit !== "capture";
      })
      .map((file) => path.relative(SRC, file));
    expect(reached).toEqual([]);
  });
});
