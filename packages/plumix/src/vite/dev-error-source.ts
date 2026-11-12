import { isAbsolute, resolve } from "node:path";

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
  /** Whether the dev server would serve `path`, by its `server.fs` rules. */
  readonly isServable: (path: string) => boolean;
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
 * Returns `"denied"` for a file the dev server would not serve, and `null` for
 * a malformed request or an unreadable file.
 */
export async function resolveSourceExcerpt(
  query: { file: string | null; line: number | null },
  deps: ResolveSourceDeps,
): Promise<SourceExcerpt | "denied" | null> {
  const { file, line } = query;
  if (file === null || line === null) return null;
  if (!Number.isInteger(line) || line < 1) return null;
  if (!isAbsolute(file)) return null;

  const resolved = resolve(file);
  if (!deps.isServable(resolved)) return "denied";

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
  deps: ResolveSourceDeps,
): Promise<{ readonly status: number; readonly body: string | null }> {
  const params = new URL(rawUrl, "http://localhost").searchParams;
  const rawLine = params.get("line");
  const excerpt = await resolveSourceExcerpt(
    {
      file: params.get("file"),
      line: rawLine === null ? null : Number(rawLine),
    },
    deps,
  );
  if (excerpt === "denied") return { status: 403, body: null };
  return excerpt === null
    ? { status: 404, body: null }
    : { status: 200, body: JSON.stringify(excerpt) };
}
