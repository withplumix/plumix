import type { DevErrorFrame } from "./contract.js";

/**
 * The dev-only endpoint the client enhancement hits to lazy-fetch a frame's
 * source excerpt. Served by a Vite dev-server middleware (Node-side, with
 * `fs`), so the worker — which has no filesystem — never reads source itself
 * (#1583). Shared here so the middleware (in `plumix/vite`) and the inlined
 * client script (in core) agree on the path.
 */
export const DEV_ERROR_SOURCE_ENDPOINT = "/@plumix-dev-error-source";

// A V8 stack line: `    at fn (file:line:col)` or `    at file:line:col`. The
// optional first group captures the function name; the path is matched
// greedily and backtracks so the trailing `:line:col` always wins, which keeps
// `node:internal/...` and `file://` paths (whose own colons would otherwise
// confuse a lazy match) intact.
const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?$/;

/**
 * Parse a raw V8 stack string into structured frames. In `plumix dev` the
 * caught stack is already sourcemapped to original `file:line:col`, so this is
 * pure string work — no sourcemap step, no `fs`. The leading message line and
 * any non-locatable lines (`at <anonymous>`) are dropped; `node_modules` /
 * `node:` frames are flagged vendor for the collapse toggle.
 */
export function parseStackFrames(stack: string): DevErrorFrame[] {
  const frames: DevErrorFrame[] = [];
  // Split on either newline style so a CRLF-terminated line's trailing `\r`
  // doesn't defeat the `$`-anchored frame regex and drop the whole stack.
  for (const line of stack.split(/\r?\n/)) {
    const match = FRAME.exec(line);
    if (!match) continue;
    const [, functionName, rawFile, lineNo, columnNo] = match;
    const file = stripFileUrl(rawFile ?? "");
    frames.push({
      ...(functionName ? { functionName } : {}),
      file,
      line: Number(lineNo),
      column: Number(columnNo),
      isVendor: file.includes("/node_modules/") || file.startsWith("node:"),
    });
  }
  return frames;
}

function stripFileUrl(file: string): string {
  return file.startsWith("file://") ? file.slice("file://".length) : file;
}

/**
 * The directory prefix shared by every absolute frame path — effectively the
 * project (or workspace) root, derived from the frames themselves so the
 * renderer can show short, root-relative paths without being told where the
 * root is. Returns `""` when fewer than two absolute paths are present (nothing
 * meaningful to strip), which leaves paths shown in full.
 */
export function commonBaseDir(frames: readonly DevErrorFrame[]): string {
  const paths = frames
    .map((frame) => frame.file)
    .filter((f) => f.startsWith("/"));
  if (paths.length < 2) return "";
  let prefix = paths[0] ?? "";
  for (const path of paths) {
    let i = 0;
    while (i < prefix.length && i < path.length && prefix[i] === path[i])
      i += 1;
    prefix = prefix.slice(0, i);
  }
  // Trim back to the last separator so the cut lands on a path boundary.
  const boundary = prefix.lastIndexOf("/");
  return boundary >= 0 ? prefix.slice(0, boundary + 1) : "";
}

/** A frame path shown relative to {@link commonBaseDir}, or in full if outside it. */
export function relativeFramePath(file: string, base: string): string {
  return base && file.startsWith(base) ? file.slice(base.length) : file;
}
