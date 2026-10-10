import { isAbsolute, resolve, sep } from "node:path";

// The worker has no `fs`, so the dev error page lazy-fetches each frame's
// excerpt from this Node-side resolver.

/** One line of a source excerpt; `highlighted` marks the offending line. */
export interface ExcerptLine {
  readonly number: number;
  readonly content: string;
  readonly highlighted: boolean;
}

export interface SourceExcerpt {
  readonly file: string;
  readonly line: number;
  readonly lines: readonly ExcerptLine[];
}

export interface ResolveSourceDeps {
  readonly readFile: (path: string) => Promise<string>;
}

const DEFAULT_RADIUS = 5;

/**
 * A window of `radius` lines either side of `line` (1-based), clamped to the
 * file bounds, with the target line flagged for highlighting.
 */
export function sliceExcerpt(
  source: string,
  line: number,
  radius: number = DEFAULT_RADIUS,
): ExcerptLine[] {
  const rows = source.split("\n");
  const start = Math.max(1, line - radius);
  const end = Math.min(rows.length, line + radius);
  const lines: ExcerptLine[] = [];
  for (let n = start; n <= end; n += 1) {
    lines.push({
      number: n,
      content: rows[n - 1] ?? "",
      highlighted: n === line,
    });
  }
  return lines;
}

/**
 * Returns `null` for a malformed request, an unreadable file, or a path outside
 * `allow`, the dev server's fs allowlist, so a crafted request can't exfiltrate
 * files.
 */
export async function resolveSourceExcerpt(
  query: { file: string | null; line: number | null; allow: readonly string[] },
  deps: ResolveSourceDeps,
): Promise<SourceExcerpt | null> {
  const { file, line, allow } = query;
  if (file === null || line === null) return null;
  if (!Number.isInteger(line) || line < 1) return null;
  if (!isAbsolute(file)) return null;

  const resolved = resolve(file);
  const permitted = allow.some(
    (root) => resolved === root || resolved.startsWith(root + sep),
  );
  if (!permitted) return null;

  let source: string;
  try {
    source = await deps.readFile(resolved);
  } catch {
    return null;
  }
  return { file: resolved, line, lines: sliceExcerpt(source, line) };
}

export async function handleDevErrorSourceRequest(
  rawUrl: string,
  allow: readonly string[],
  deps: ResolveSourceDeps,
): Promise<{ readonly status: number; readonly body: string | null }> {
  const params = new URL(rawUrl, "http://localhost").searchParams;
  const rawLine = params.get("line");
  const excerpt = await resolveSourceExcerpt(
    {
      file: params.get("file"),
      line: rawLine === null ? null : Number(rawLine),
      allow,
    },
    deps,
  );
  return excerpt === null
    ? { status: 404, body: null }
    : { status: 200, body: JSON.stringify(excerpt) };
}
