import { beforeAll, describe, expect, test } from "vitest";

import { ROSTER } from "../roster.js";
import { coveredPackages, exportsOf, ownDevDependencies } from "../surface.js";

const covered = coveredPackages();

// Every name a covered subpath exports, read from its built `.d.ts`. Parsing
// the declarations is CPU-bound, so it is paid once, from the hook.
let published: Map<string, string[]>;
beforeAll(() => {
  published = exportsOf(covered.flatMap((pkg) => [...pkg.subpaths.values()]));
}, 60_000);

function exportsFor(pkg: string, subpath: string): string[] {
  const file = covered.find(({ name }) => name === pkg)?.subpaths.get(subpath);
  return file === undefined ? [] : (published.get(file) ?? []);
}

test("every covered package is a devDependency, so turbo builds it first", () => {
  const dependencies = ownDevDependencies();
  expect(
    covered
      .map(({ name }) => name)
      .filter((name) => !dependencies.includes(name)),
    "add each one to tooling/published-surface/package.json's devDependencies",
  ).toEqual([]);
});

test("every covered package has an exports map, so nothing else deep-imports", () => {
  expect(
    covered.filter((pkg) => !pkg.hasExportsMap).map(({ name }) => name),
  ).toEqual([]);
});

describe.each(covered)("$name", (pkg) => {
  test("every export is a recorded decision", () => {
    const unrecorded = [...pkg.subpaths.keys()].flatMap((subpath) => {
      const recorded = (ROSTER[pkg.name]?.[subpath] ?? []).flatMap(
        (row) => row.names,
      );
      return exportsFor(pkg.name, subpath)
        .filter((name) => !recorded.includes(name))
        .map((name) => `${pkg.name} ${subpath}: ${name}`);
    });
    expect(
      unrecorded,
      "Each of these is published without a decision. Add a row with a " +
        "reason to tooling/published-surface/roster.ts, or stop exporting it.",
    ).toEqual([]);
  });

  test("every row names something the subpath still exports", () => {
    const stale = Object.entries(ROSTER[pkg.name] ?? {}).flatMap(
      ([subpath, rows]) =>
        rows
          .flatMap((row) => row.names)
          .filter((name) => !exportsFor(pkg.name, subpath).includes(name))
          .map((name) => `${pkg.name} ${subpath}: ${name}`),
    );
    expect(stale, "remove these names from roster.ts").toEqual([]);
  });

  test("every row says why", () => {
    expect(
      Object.values(ROSTER[pkg.name] ?? {})
        .flat()
        .filter((row) => row.reason.trim() === "")
        .map((row) => row.names.join(", ")),
    ).toEqual([]);
  });
});

test("the roster records no package or subpath the workspace does not cover", () => {
  expect(
    Object.entries(ROSTER).flatMap(([name, subpaths]) =>
      Object.keys(subpaths)
        .filter(
          (subpath) =>
            covered.find((pkg) => pkg.name === name)?.subpaths.has(subpath) !==
            true,
        )
        .map((subpath) => `${name} ${subpath}`),
    ),
  ).toEqual([]);
});
