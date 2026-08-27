import { existsSync, globSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

/**
 * Repo root, resolved from this module rather than `process.cwd()` so the
 * scan finds the same files however vitest was invoked.
 */
export const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** A port an e2e suite binds, as its playwright config declares it. */
export interface PortClaim {
  /** The option it was declared under — `port`, `inspectorPort`, … */
  readonly option: string;
  readonly port: number;
}

/** A port option whose value this scan could not reduce to a number. */
export interface UnresolvedPort {
  readonly option: string;
  readonly expression: string;
}

/** Every port one playwright config declares, and who owns it. */
export interface SuitePorts {
  readonly packageName: string;
  /** Repo-relative path to the playwright config. */
  readonly file: string;
  readonly claims: readonly PortClaim[];
  readonly unresolved: readonly UnresolvedPort[];
}

/** One suite's stake in a contested port. */
export interface ConflictingClaim {
  readonly packageName: string;
  /** Repo-relative path to the playwright config. */
  readonly file: string;
  readonly option: string;
}

export interface PortConflict {
  readonly port: number;
  readonly claims: readonly ConflictingClaim[];
}

// Any option whose name ends in `port` binds one, so a new one in
// `PlumixE2EConfigOptions` is covered without teaching this scan about it.
// `viewport` is the single exception: it reads like a port and binds nothing.
const PORT_OPTION = /(?<![\w$])(\w*[Pp]ort)\s*:\s*([^,\n}]+)/g;
// A suite with a custom `webServerCommand` binds its port on the command line
// rather than through an option. Only the literal form is read: `--port
// ${String(E2E_PORT)}` interpolates the `port` option the scan already has,
// and counting it again would report every admin suite as its own rival.
const PORT_FLAG = /--([\w-]*port)[= ](\d+)(?![\w.])/g;
const NUMERIC_CONST = /(?<![\w$])const\s+([\w$]+)\s*=\s*(\d+)\s*;/g;
const INTEGER = /^\d+$/;

// The configs write their port allocation down in prose — apps/demo's says
// where its pair sits relative to the plugin suites — so a comment is as
// likely to hold a port as the code is. `//` comments are cut only where they
// own the line: prettier puts every comment in these files on its own, and a
// blunter cut would take a `port:` trailing a `http://localhost` with it.
function withoutComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/^[^\S\n]*\/\/.*$/gm, "");
}

function numericConsts(source: string): Map<string, number> {
  return new Map(
    [...source.matchAll(NUMERIC_CONST)].map((match) => [
      match[1] ?? "",
      Number(match[2]),
    ]),
  );
}

/**
 * Reads the ports a playwright config declares, textually.
 *
 * Textual because importing the config is not available here: the plugin and
 * demo suites import `plumix/test/playwright`, whose `dist/` a `test:unit`
 * run has no build behind it to produce. The two forms the configs use — a
 * literal, and a file-local `const` the admin suites share with their
 * `vite preview` command — both resolve; a `port:` option that reduces to
 * neither is reported rather than passed over, so the scan cannot go quietly
 * blind to a port a config declares.
 */
export function parsePortClaims(source: string): {
  claims: PortClaim[];
  unresolved: UnresolvedPort[];
} {
  const code = withoutComments(source);
  const consts = numericConsts(code);
  const claims: PortClaim[] = [];
  const unresolved: UnresolvedPort[] = [];

  for (const match of code.matchAll(PORT_OPTION)) {
    const option = match[1] ?? "";
    if (option === "viewport") continue;
    const expression = (match[2] ?? "").trim();
    const port = INTEGER.test(expression)
      ? Number(expression)
      : consts.get(expression);
    if (port === undefined) unresolved.push({ option, expression });
    else claims.push({ option, port });
  }

  for (const match of code.matchAll(PORT_FLAG)) {
    claims.push({ option: `--${match[1] ?? ""}`, port: Number(match[2]) });
  }

  return { claims, unresolved };
}

// `exclude` is handed a repo-relative path, so match on its last segment —
// every nested `node_modules` and `dist` has to be pruned, not just the ones
// at the root.
const NOT_SOURCE = new Set([
  "node_modules",
  "dist",
  ".git",
  ".turbo",
  ".wrangler",
  ".cache",
]);

/** Every playwright config in the repo, as repo-relative paths. */
export function discoverPlaywrightConfigs(root: string): string[] {
  return globSync("**/playwright.config.ts", {
    cwd: root,
    exclude: (path) => NOT_SOURCE.has(basename(path)),
  }).sort();
}

function packageNameFor(root: string, file: string): string {
  for (
    let dir = resolve(root, dirname(file));
    dir.startsWith(root);
    dir = dirname(dir)
  ) {
    const manifest = resolve(dir, "package.json");
    if (!existsSync(manifest)) continue;
    const { name } = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: string;
    };
    if (name !== undefined) return name;
  }
  return relative(root, resolve(root, dirname(file)));
}

export function readSuitePorts(root: string, file: string): SuitePorts {
  return {
    packageName: packageNameFor(root, file),
    file,
    ...parsePortClaims(readFileSync(resolve(root, file), "utf8")),
  };
}

/**
 * Ports more than one suite binds.
 *
 * One suite naming the same port twice is one listener — `webServerPort` is
 * documented as the readiness view of `port` — so claims are counted per
 * config file. A suite that collides with itself fails the moment it runs,
 * alone; this looks for the collision that fails somebody else's suite.
 */
export function findPortConflicts(
  suites: readonly SuitePorts[],
): PortConflict[] {
  const byPort = new Map<number, ConflictingClaim[]>();
  for (const { packageName, file, claims } of suites) {
    const seen = new Set<number>();
    for (const { option, port } of claims) {
      if (seen.has(port)) continue;
      seen.add(port);
      const claimants = byPort.get(port) ?? [];
      claimants.push({ packageName, file, option });
      byPort.set(port, claimants);
    }
  }

  return [...byPort]
    .filter(([, claims]) => claims.length > 1)
    .sort(([left], [right]) => left - right)
    .map(([port, claims]) => ({ port, claims }));
}

export function describePortConflict(conflict: PortConflict): string {
  const claimants = conflict.claims
    .map(
      ({ packageName, file, option }) =>
        `  - ${packageName} — ${file} (\`${option}\`)`,
    )
    .join("\n");
  return [
    `Port ${String(conflict.port)} is claimed by more than one e2e suite:`,
    claimants,
    "`turbo run test:e2e` starts the suites in parallel, so one of them loses the",
    "bind and fails pointing at the other's package. Move one to a port no other",
    "config claims — CONTRIBUTING.md documents the convention.",
  ].join("\n");
}
