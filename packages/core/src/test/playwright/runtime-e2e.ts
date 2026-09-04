import { existsSync, globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * What a runtime package declares about running a playground under
 * Playwright, in the `plumix.e2e` block of its package.json — beside the
 * `plumix.scaffold` block the scaffolder reads.
 */
export interface RuntimeE2E {
  readonly packageName: string;
  /** Paths, relative to the playground, wiped before the server starts. */
  readonly wipe: readonly string[];
  /** Where the playground's SQLite file lives once migrations have run. */
  readonly database: {
    /** Glob relative to the playground; must resolve to exactly one file. */
    readonly glob: string;
    /** File names the glob also matches that are not the database. */
    readonly exclude?: readonly string[];
  };
}

interface PackageJson {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly plumix?: {
    readonly scaffold?: { readonly kind?: string };
    readonly e2e?: Omit<RuntimeE2E, "packageName">;
  };
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

// A dependency pnpm did not link into the playground's own node_modules is
// not the runtime; the playground's own manifest failing to read is an error
// in its own right and stays one.
function readDependencyPackageJson(path: string): PackageJson | null {
  return existsSync(path) ? readPackageJson(path) : null;
}

/**
 * The `plumix.e2e` block of the runtime package a playground depends on.
 *
 * The runtime is found the way the scaffolder's registry finds it: it is
 * whichever dependency carries a runtime scaffold block. Read through the
 * playground's own `node_modules` rather than the export map, which no
 * runtime exposes its package.json through.
 */
export function readRuntimeE2E(playgroundDir: string): RuntimeE2E {
  const own = readPackageJson(join(playgroundDir, "package.json"));
  const names = Object.keys({ ...own.dependencies, ...own.devDependencies });
  const runtimes = names.flatMap((name) => {
    const pkg = readDependencyPackageJson(
      join(playgroundDir, "node_modules", name, "package.json"),
    );
    return pkg?.plumix?.scaffold?.kind === "runtime" ? [{ name, pkg }] : [];
  });
  const [runtime, ...more] = runtimes;
  if (runtime === undefined) {
    throw new Error(
      `readRuntimeE2E: no runtime package among the dependencies of ${playgroundDir} — none has a "plumix.scaffold" block of kind "runtime".`,
    );
  }
  if (more.length > 0) {
    throw new Error(
      `readRuntimeE2E: ${String(runtimes.length)} runtime packages among the dependencies of ${playgroundDir} (${runtimes.map((r) => r.name).join(", ")}) — a playground runs on one.`,
    );
  }
  const e2e = runtime.pkg.plumix?.e2e;
  if (!e2e) {
    throw new Error(
      `readRuntimeE2E: ${runtime.name} declares no "plumix.e2e" block in its package.json — it must declare { wipe, database }.`,
    );
  }
  return { packageName: runtime.name, ...e2e };
}

/**
 * Absolute path of the playground's database, resolved through the
 * runtime's `plumix.e2e` block. Exactly one file must match: none means the
 * server has not migrated yet, several means the glob is too wide.
 */
export function resolvePlaygroundDbPath(playgroundDir: string): string {
  const { packageName, database } = readRuntimeE2E(playgroundDir);
  const excluded = new Set(database.exclude ?? []);
  const matches = globSync(database.glob, { cwd: playgroundDir }).filter(
    (match) => !excluded.has(basename(match)),
  );
  const [match, ...more] = matches;
  if (match === undefined) {
    throw new Error(
      `resolvePlaygroundDbPath: no database matches ${database.glob} under ${playgroundDir} (declared by ${packageName}) — run plumix migrate apply, or plumix dev, first.`,
    );
  }
  if (more.length > 0) {
    throw new Error(
      `resolvePlaygroundDbPath: ${String(matches.length)} files match ${database.glob} under ${playgroundDir} (${matches.join(", ")}) — ${packageName}'s "plumix.e2e" block must name one database.`,
    );
  }
  return join(playgroundDir, match);
}
