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

/**
 * Any option named `*port` binds one, so new options are covered unasked.
 * `viewport` reads like a port and binds nothing.
 */
const PORT_OPTION = /(?<![\w$])(\w*[Pp]ort)\s*:\s*([^,\n}]+)/g;
/**
 * Only the literal flag is read: an interpolated `--port` repeats the `port`
 * option already scanned, and counting it twice makes each admin suite its own
 * rival.
 */
const PORT_FLAG = /--([\w-]*port)[= ](\d+)(?![\w.])/g;
const NUMERIC_CONST = /(?<![\w$])const\s+([\w$]+)\s*=\s*(\d+)\s*;/g;
const INTEGER = /^\d+$/;
/**
 * Configs discuss ports in prose. `//` is cut only where it owns the line, or a
 * `port:` after `http://localhost` would go with it.
 */
function withoutComments(source: string): string {
  return withoutBlockComments(source).replaceAll(/^[^\S\n]*\/\/.*$/gm, "");
}

// Walked, not matched: every regex for `/* … */` is quadratic on a run of
// unterminated openers, which CodeQL fails as a polynomial ReDoS.
function withoutBlockComments(source: string): string {
  let kept = "";
  let at = 0;
  for (
    let open = source.indexOf("/*");
    open !== -1;
    open = source.indexOf("/*", at)
  ) {
    const close = source.indexOf("*/", open + 2);
    if (close === -1) break;
    kept += source.slice(at, open);
    at = close + 2;
  }
  return kept + source.slice(at);
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
 * Textual because the configs import `plumix/test/playwright`, whose `dist/`
 * `test:unit` has not built. A `port:` that is neither a literal nor a local
 * `const` is reported, not skipped.
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

/**
 * `exclude` is handed a repo-relative path, so match on its last segment —
 * every nested `node_modules` and `dist` has to be pruned, not just the ones
 * at the root.
 */
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
 * Counted per config file: `webServerPort` is the readiness view of `port`, so
 * one suite naming a port twice is one listener.
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
