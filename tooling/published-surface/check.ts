import { emittedJsViolations, typeRoleViolations } from "./facade.ts";
import { ROSTER } from "./roster.ts";
import { coveredPackages, exportsOf, ownDevDependencies } from "./surface.ts";

function rosterViolations(): string[] {
  const covered = coveredPackages();
  const published = exportsOf(
    covered.flatMap((pkg) => [...pkg.subpaths.values()]),
  );

  function exportsFor(pkg: string, subpath: string): string[] {
    const file = covered
      .find(({ name }) => name === pkg)
      ?.subpaths.get(subpath);
    return file === undefined ? [] : (published.get(file) ?? []);
  }

  // Depending on a package without declarations orders nothing, and its `bin`
  // would point at a `dist/` a fresh install lacks.
  const dependencies = ownDevDependencies();
  const undeclared = covered
    .filter(({ subpaths }) => subpaths.size > 0)
    .filter(({ name }) => !dependencies.includes(name))
    .map(
      ({ name }) =>
        `${name}: every covered package with declarations is a ` +
        "devDependency of @plumix/published-surface, so turbo builds it first",
    );

  const unmapped = covered
    .filter((pkg) => !pkg.hasExportsMap)
    .map(
      ({ name }) =>
        `${name}: every covered package has an exports map, so nothing ` +
        "else deep-imports",
    );

  const perPackage = covered.flatMap((pkg) => {
    const rows = ROSTER[pkg.name] ?? {};
    const unrecorded = [...pkg.subpaths.keys()].flatMap((subpath) => {
      const recorded = (rows[subpath] ?? []).flatMap((row) => row.names);
      return exportsFor(pkg.name, subpath)
        .filter((name) => !recorded.includes(name))
        .map(
          (name) =>
            `${pkg.name} ${subpath} ${name}: every export is a recorded ` +
            "decision; add a row with a reason to roster.ts, or stop " +
            "exporting it",
        );
    });
    const stale = Object.entries(rows).flatMap(([subpath, subpathRows]) =>
      subpathRows
        .flatMap((row) => row.names)
        .filter((name) => !exportsFor(pkg.name, subpath).includes(name))
        .map(
          (name) =>
            `${pkg.name} ${subpath} ${name}: every row names something ` +
            "the subpath still exports",
        ),
    );
    const unexplained = Object.entries(rows).flatMap(([subpath, subpathRows]) =>
      subpathRows
        .filter((row) => row.reason.trim() === "")
        .map(
          (row) =>
            `${pkg.name} ${subpath} ${row.names.join(", ")}: every row ` +
            "says why",
        ),
    );
    return [...unrecorded, ...stale, ...unexplained];
  });

  const uncovered = Object.entries(ROSTER).flatMap(([name, subpaths]) =>
    Object.keys(subpaths)
      .filter(
        (subpath) =>
          covered.find((pkg) => pkg.name === name)?.subpaths.has(subpath) !==
          true,
      )
      .map(
        (subpath) =>
          `${name} ${subpath}: the roster records no package or subpath ` +
          "the workspace does not cover",
      ),
  );

  return [...undeclared, ...unmapped, ...perPackage, ...uncovered];
}

const violations = [
  ...rosterViolations(),
  ...typeRoleViolations(),
  ...emittedJsViolations(),
];
for (const violation of violations) console.error(violation);
process.exitCode = violations.length > 0 ? 1 : 0;
