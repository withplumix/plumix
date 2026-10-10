import type { DevErrorFrame } from "./contract.js";

/**
 * Served by a Node-side Vite middleware, since the worker has no filesystem to
 * read source from.
 */
export const DEV_ERROR_SOURCE_ENDPOINT = "/@plumix-dev-error-source";

/**
 * Browser stacks point at Vite's served module URLs, so the Node-side resolver
 * maps each frame back to its original `file:line`.
 */
export const DEV_ERROR_STACK_ENDPOINT = "/@plumix-dev-error-stack";

/**
 * Receives batched client failures, which the Vite middleware sourcemaps and
 * prints to the `plumix dev` terminal tagged `[browser]`.
 */
export const DEV_ERROR_TERMINAL_ENDPOINT = "/@plumix-dev-error-terminal";

/**
 * A GET for the retained client failures, already sourcemapped, newest-first.
 * The browser never calls it; the worker-side MCP `error_list` tool does.
 */
export const DEV_ERROR_CLIENT_ERRORS_ENDPOINT = "/@plumix-dev-client-errors";

/**
 * Anchored, with no catch-all `.+`, so it can't backtrack superlinearly on a
 * hostile stack (CodeQL ReDoS).
 */
const LOCATION = /:(\d+):(\d+)\)?$/;

/**
 * Expects an already-sourcemapped stack, as in `plumix dev`. Lines with no
 * location are dropped; `node_modules` and `node:` frames are flagged vendor.
 */
export function parseStackFrames(stack: string): DevErrorFrame[] {
  const frames: DevErrorFrame[] = [];
  for (const raw of stack.split(/\r?\n/)) {
    // `trim()` also sheds any CRLF `\r` so it can't defeat the `$` anchor.
    const line = raw.trim();
    if (!line.startsWith("at ")) continue;
    const location = LOCATION.exec(line);
    if (!location) continue;
    const [matched, lineNo, columnNo] = location;

    // A V8 function name never contains " (", but a path can, so splitting on
    // the first match keeps the path whole.
    const head = line.slice(3, line.length - matched.length);
    const paren = head.indexOf(" (");
    const functionName = paren >= 0 ? head.slice(0, paren) : undefined;
    const afterParen = paren >= 0 ? head.slice(paren + 2) : head;
    // Drop a leading "(" from the rare `at (path)` (anonymous-with-parens)
    // form.
    const rawFile = afterParen.startsWith("(")
      ? afterParen.slice(1)
      : afterParen;
    const file = stripFileUrl(rawFile);

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
 * `""` when fewer than two absolute paths are present, so paths show in full.
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

/**
 * A frame path shown relative to {@link commonBaseDir}, or in full if outside
 * it.
 */
export function relativeFramePath(file: string, base: string): string {
  return base && file.startsWith(base) ? file.slice(base.length) : file;
}
