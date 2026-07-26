import type { DevErrorFrame } from "./contract.js";

/**
 * The dev-only endpoint the client enhancement hits to lazy-fetch a frame's
 * source excerpt. Served by a Vite dev-server middleware (Node-side, with
 * `fs`), so the worker — which has no filesystem — never reads source itself
 * (#1583). Shared here so the middleware (in `plumix/vite`) and the inlined
 * client script (in core) agree on the path.
 */
export const DEV_ERROR_SOURCE_ENDPOINT = "/@plumix-dev-error-source";

/**
 * The dev-only endpoint the client island overlay (#1603) POSTs a raw browser
 * stack to. Browser stacks carry transformed positions pointing at Vite's served
 * module URLs (unlike server stacks, which arrive already sourcemapped), so the
 * Node-side resolver maps each frame back to its original `file:line` via Vite's
 * module graph before the shared renderer shows it. Shared here so the middleware
 * (in `plumix/vite`) and the overlay (in `@plumix/blocks`) agree on the path.
 */
export const DEV_ERROR_STACK_ENDPOINT = "/@plumix-dev-error-stack";

// The trailing `:line:col` (with an optional closing paren) of a V8 frame.
// Anchored, with non-overlapping `\d+` runs, so it can only ever scan the tail
// once — no catch-all `.+` that could backtrack superlinearly on a hostile
// stack (CodeQL ReDoS). Everything before it is sliced apart with plain string
// ops, which keeps `node:internal/...` and `file://` colons intact for free.
const LOCATION = /:(\d+):(\d+)\)?$/;

/**
 * Parse a raw V8 stack string into structured frames. In `plumix dev` the
 * caught stack is already sourcemapped to original `file:line:col`, so this is
 * pure string work — no sourcemap step, no `fs`. The leading message line and
 * any non-locatable lines (`at <anonymous>`) are dropped; `node_modules` /
 * `node:` frames are flagged vendor for the collapse toggle.
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

    // Between "at " and the trailing location: a bare path, or
    // "functionName (path". Split on the first " (" — a V8 function name never
    // contains one, but a path can, so first-match keeps the path whole.
    const head = line.slice(3, line.length - matched.length);
    const paren = head.indexOf(" (");
    const functionName = paren >= 0 ? head.slice(0, paren) : undefined;
    const afterParen = paren >= 0 ? head.slice(paren + 2) : head;
    // Drop a leading "(" from the rare `at (path)` (anonymous-with-parens) form.
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
