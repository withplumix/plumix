import * as path from "node:path";
import { describe, expect, test } from "vitest";

import {
  importsOf,
  resolveWithinCore,
  sourceFilesUnder,
  staticClosureOf,
} from "../test/import-graph.js";

/**
 * TypeScript resolves cycles between sibling directories happily, so only a
 * test can hold the one-way direction: surface, then panel vocabulary, then
 * captured request.
 */
const UNIT_NAMES = ["capture", "panels", "bar", "routes"] as const;
type UnitName = (typeof UNIT_NAMES)[number];

interface Unit {
  /**
   * Path under `src/` naming a directory or a module; a prefix match alone
   * would let a module claim a sibling that merely shares the prefix.
   */
  readonly base: string;
  /** The other units it may name. Its own files are always allowed. */
  readonly mayImport: readonly UnitName[];
}

const UNITS: Readonly<Record<UnitName, Unit>> = {
  capture: { base: "dev/request-history", mayImport: [] },
  // Owns `dev.panels` as well, since both surfaces resolve the setting here.
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
  /**
   * `importer → imported`, both relative to `src/`, for the failure message.
   */
  readonly label: string;
  readonly target: UnitName;
}

/** Every edge out of `file` that lands in a different unit of the cluster. */
function crossUnitEdges(file: string): readonly CrossUnitEdge[] {
  const { static: statics, dynamic, typeOnly } = importsOf(file);
  // A dynamic import still links a cycle, only later, and a type-only one
  // leaves no trace in the emitted graph.
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

/**
 * The dev MCP tools read the app's ring off the context, so importing the
 * cluster would drag the panel graph into the tool registry.
 */
const MCP_READERS = ["mcp/telemetry-tools.ts", "mcp/error-tools.ts"] as const;

describe("the dev MCP tools read the capture layer only", () => {
  // The whole reachable graph, not the tool's own import list: a reach that
  // goes through `context/mcp-tool.js` or any other intermediate costs the
  // same and would pass a one-level check.
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
