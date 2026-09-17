import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ResolvedCopy {
  readonly version: string;
  readonly path: string;
}

interface RawWhyEntry {
  version: unknown;
  path: unknown;
}

function isRawWhyEntry(value: unknown): value is RawWhyEntry {
  return typeof value === "object" && value !== null;
}

// `pnpm why <pkg> --json` returns one top-level array entry per distinct
// resolved copy, each carrying the real filesystem path pnpm installed it to.
export function parseResolvedCopies(whyOutputJson: string): ResolvedCopy[] {
  const parsed: unknown = JSON.parse(whyOutputJson);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRawWhyEntry).map((entry) => ({
    version: typeof entry.version === "string" ? entry.version : "",
    path: typeof entry.path === "string" ? entry.path : "",
  }));
}

export async function resolvedCopiesOf(
  packageName: string,
  cwd: string,
): Promise<ResolvedCopy[]> {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["why", packageName, "--json"],
    { cwd },
  );
  return parseResolvedCopies(stdout);
}
