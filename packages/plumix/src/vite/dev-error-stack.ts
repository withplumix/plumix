import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import type { SourceMapInput } from "@jridgewell/trace-mapping";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

import type { DevErrorFrame } from "@plumix/blocks/dev-error";

// The client-stack resolver (#1572, #1583): the Node-side half of the island
// overlay's frame view. A browser stack carries transformed positions pointing
// at Vite's served module URLs (e.g. `http://localhost:5173/src/Counter.tsx?t=1
// :14:20`), so this maps each frame back to its original `file:line` through the
// dev server's per-module sourcemaps before the shared renderer shows it — the
// same `DevErrorFrame[]` shape the already-sourcemapped server page produces.
// All logic is pure over an injected `lookup`, so it tests without a live server.

/** One frame parsed out of a raw browser stack, before sourcemap resolution. */
interface RawFrame {
  readonly functionName?: string;
  /** The module URL as it appeared in the stack (origin stripped). */
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

export interface ResolveStackDeps {
  /**
   * Map a browser module URL to its dev transform sourcemap and absolute file
   * path, or `null` when the module isn't in the graph (a pre-bundled dep served
   * from cache, an external script). The map drives position resolution; the
   * file is the fallback location and the base for relative sourcemap sources.
   */
  readonly lookup: (
    url: string,
  ) => Promise<{ map: SourceMapInput | null; file: string | null } | null>;
}

// The trailing `:line:column` (with an optional closing paren) common to Chrome
// and Firefox frames. Anchored with bounded `\d+` runs — no catch-all that could
// backtrack on a hostile stack.
const LOCATION = /:(\d+):(\d+)\)?$/;

/**
 * Parse a raw browser stack into frames. Handles the Chrome (`at fn (url:l:c)`,
 * `at url:l:c`) and Firefox (`fn@url:l:c`, `@url:l:c`) shapes; the leading
 * message line and any line without a trailing location are dropped.
 */
export function parseBrowserStack(stack: string): RawFrame[] {
  const frames: RawFrame[] = [];
  for (const raw of stack.split(/\r?\n/)) {
    const frame = parseBrowserStackLine(raw);
    if (frame) frames.push(frame);
  }
  return frames;
}

function parseBrowserStackLine(raw: string): RawFrame | null {
  const line = raw.trim();
  const location = LOCATION.exec(line);
  if (!location) return null;
  const [matched, lineNo, columnNo] = location;
  const head = line.slice(0, line.length - matched.length);

  let functionName: string | undefined;
  let url: string;
  if (head.startsWith("at ")) {
    // Chrome: "fn (url" or a bare "url". A function name never contains " (",
    // but a URL can, so split on the first occurrence to keep the URL whole.
    const rest = head.slice(3);
    const paren = rest.indexOf(" (");
    if (paren >= 0) {
      functionName = rest.slice(0, paren).replace(/^async /, "");
      const afterParen = rest.slice(paren + 2);
      url = afterParen.startsWith("(") ? afterParen.slice(1) : afterParen;
    } else {
      url = rest;
    }
  } else {
    // Firefox: "fn@url", "@url", or a bare "url". URLs don't contain `@`, so the
    // last `@` separates an (optional) name from the URL.
    const at = head.lastIndexOf("@");
    if (at >= 0) {
      functionName = head.slice(0, at) || undefined;
      url = head.slice(at + 1);
    } else {
      url = head;
    }
  }

  url = url.trim();
  // Drop non-locatable frames (eval wrappers, `<anonymous>`): a real frame URL
  // is either an absolute path or a `scheme:` URL, never a bare word or `eval …`.
  if (!/^(\/|[a-z][a-z0-9+.-]*:)/i.test(url)) return null;
  return {
    ...(functionName ? { functionName } : {}),
    url,
    line: Number(lineNo),
    column: Number(columnNo),
  };
}

/** Resolve a raw browser stack into original-source frames for the renderer. */
export async function resolveClientStack(
  stack: string,
  deps: ResolveStackDeps,
): Promise<DevErrorFrame[]> {
  const frames: DevErrorFrame[] = [];
  for (const raw of parseBrowserStack(stack)) {
    const frame = await resolveFrame(raw, deps);
    if (frame) frames.push(frame);
  }
  return frames;
}

async function resolveFrame(
  raw: RawFrame,
  deps: ResolveStackDeps,
): Promise<DevErrorFrame | null> {
  const moduleUrl = cleanModuleUrl(raw.url);
  const looked = await deps.lookup(moduleUrl).catch(() => null);

  let file = looked?.file ?? urlToPath(moduleUrl);
  let line = raw.line;
  let column = raw.column;
  let functionName = raw.functionName;

  // A sourcemapped module resolves to its original file:line. If the map is
  // present but misses (or is Vite's empty-`mappings` sentinel for an
  // untransformed dep), the served file with the transformed line is kept —
  // esbuild preserves line numbers, so that's a close best-effort, not a jump.
  if (looked?.map) {
    const original = mapPosition(looked.map, raw, looked.file);
    if (original) {
      file = original.file;
      line = original.line;
      column = original.column;
      functionName ??= original.name;
    }
  }

  if (!file) return null;
  return {
    ...(functionName ? { functionName } : {}),
    file,
    line,
    column,
    isVendor: isVendorPath(file),
  };
}

interface OriginalPosition {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly name?: string;
}

function mapPosition(
  map: SourceMapInput,
  raw: RawFrame,
  moduleFile: string | null,
): OriginalPosition | null {
  try {
    const tracer = new TraceMap(map);
    const found = originalPositionFor(tracer, {
      line: raw.line,
      // Browser stack columns are 1-based; trace-mapping wants 0-based.
      column: Math.max(0, raw.column - 1),
    });
    // A miss (or Vite's empty-`mappings` sentinel) yields a null source; fall
    // back to the transformed location. `line`/`column` come as a set with a
    // non-null source, so no separate guard is needed.
    if (found.source === null) return null;
    return {
      file: resolveSource(found.source, moduleFile),
      line: found.line,
      column: found.column,
      ...(found.name ? { name: found.name } : {}),
    };
  } catch {
    // A malformed map falls back to the transformed location.
    return null;
  }
}

// A sourcemap `source` is usually an absolute path, but can be relative to the
// module (or carry Vite's `/@fs/` prefix). Resolve it to a real fs path so the
// excerpt resolver can read it.
function resolveSource(source: string, moduleFile: string | null): string {
  const path = stripFsPrefix(source);
  if (isAbsolute(path)) return path;
  if (moduleFile) return resolvePath(dirname(moduleFile), path);
  return path;
}

// Vite serves out-of-root files under `/@fs/<abs>`; strip that back to the path.
function stripFsPrefix(path: string): string {
  return path.startsWith("/@fs/") ? path.slice("/@fs".length) : path;
}

// Reduce a browser stack URL to the module path the graph keys on: drop the
// `scheme://host[:port]` origin and any `?v=`/`?t=` cache-bust query (the graph
// stores modules without it, so a query makes `getModuleByUrl` miss).
function cleanModuleUrl(url: string): string {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");
  const query = path.indexOf("?");
  return query >= 0 ? path.slice(0, query) : path;
}

// Fallback location when a frame has no sourcemap (a pre-bundled dep) — the
// module path itself, with Vite's `/@fs/` prefix stripped to a real fs path.
function urlToPath(moduleUrl: string): string {
  return stripFsPrefix(moduleUrl);
}

function isVendorPath(file: string): boolean {
  return (
    file.includes("/node_modules/") ||
    file.includes("/.vite/deps/") ||
    file.startsWith("node:")
  );
}

/**
 * Adapt a raw request body (`{"stack":"…"}`) into a status + JSON body, so the
 * Vite middleware is a thin adapter over this. Returns `400` on a malformed
 * body and `{ frames: [] }` when nothing resolved.
 */
export async function handleDevErrorStackRequest(
  body: string,
  deps: ResolveStackDeps,
): Promise<{ readonly status: number; readonly body: string }> {
  const badRequest = { status: 400, body: JSON.stringify({ frames: [] }) };
  let stack: unknown;
  try {
    stack = (JSON.parse(body) as { stack?: unknown }).stack;
  } catch {
    return badRequest;
  }
  if (typeof stack !== "string") {
    return badRequest;
  }
  const frames = await resolveClientStack(stack, deps);
  return { status: 200, body: JSON.stringify({ frames }) };
}
