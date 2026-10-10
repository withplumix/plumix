import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import type { SourceMapInput } from "@jridgewell/trace-mapping";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

import type { DevErrorFrame } from "@plumix/core/dev-client";

// Maps browser stack frames, which point at Vite's served module URLs, back to
// original `file:line` through the dev server's sourcemaps.

interface RawFrame {
  readonly functionName?: string;
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

export interface ResolveStackDeps {
  /**
   * Returns `null` when the module isn't in the graph, such as a pre-bundled
   * dep or external script.
   */
  readonly lookup: (
    url: string,
  ) => Promise<{ map: SourceMapInput | null; file: string | null } | null>;
}

// The trailing `:line:column` (with an optional closing paren) common to Chrome
// and Firefox frames. Anchored with bounded `\d+` runs — no catch-all that
// could backtrack on a hostile stack.
const LOCATION = /:(\d+):(\d+)\)?$/;

/**
 * Handles Chrome and Firefox stack shapes; lines without a trailing location
 * are dropped.
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
    // Firefox: "fn@url", "@url", or a bare "url". URLs don't contain `@`, so
    // the last `@` separates an (optional) name from the URL.
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
  // is either an absolute path or a `scheme:` URL, never a bare word or `eval
  // …`.
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

  // On a map miss the transformed line is kept: esbuild preserves line numbers,
  // so it is close.
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
    // A miss, or Vite's empty-`mappings` sentinel, yields a null source.
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

// A sourcemap `source` can be module-relative or carry Vite's `/@fs/` prefix.
function resolveSource(source: string, moduleFile: string | null): string {
  const path = stripFsPrefix(source);
  if (isAbsolute(path)) return path;
  if (moduleFile) return resolvePath(dirname(moduleFile), path);
  return path;
}

// Vite serves out-of-root files under `/@fs/<abs>`; strip that back to the
// path.
function stripFsPrefix(path: string): string {
  return path.startsWith("/@fs/") ? path.slice("/@fs".length) : path;
}

// The graph keys modules without the `?v=`/`?t=` cache-bust query, so a query
// makes `getModuleByUrl` miss.
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
 * Returns `400` on a malformed body and `{ frames: [] }` when nothing resolved.
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
