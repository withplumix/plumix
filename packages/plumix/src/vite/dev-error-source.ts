import { isAbsolute, resolve, sep } from "node:path";

// The dev source-frame resolver (#1583): the Node-side half of the excerpt
// mechanism. The worker has no `fs`, so the dev error page ships resolved
// `file:line` positions (free from the sourcemapped stack) and the client
// lazy-fetches each frame's excerpt from this resolver, mounted as a Vite
// dev-server middleware. All logic here is pure over an injected `readFile`,
// so it tests without touching disk or standing up a server.

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
 * Resolve a `{ file, line }` request into a highlighted source excerpt, or
 * `null` when the request is malformed, the path is out of bounds, or the file
 * can't be read. Reads are confined to `allow` — the dev server's own fs
 * allowlist (`server.config.server.fs.allow`), which spans the workspace root
 * and so already covers both symlinked monorepo packages and their hoisted
 * `node_modules`. Mirroring Vite's own transform guard keeps a crafted request
 * from exfiltrating files outside the served tree, even though this only ever
 * runs in dev on localhost.
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

/**
 * Adapt a raw request URL (`/@plumix-dev-error-source?file=…&line=…`) into a
 * status + JSON body, so the Vite middleware is a trivial `res.end(body)`
 * adapter over this. Kept free of `node:http` types so it tests as a pure
 * function.
 */
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
