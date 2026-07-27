import type { DevErrorFrame, ForwardedLog } from "@plumix/blocks/dev-error";

// Browser-errors-to-terminal (#1604, decisions #1573/#1579). The dev-only island
// catch net POSTs client failures — uncaught exceptions plus `console.error` /
// `console.warn` — here, and this prints them into the `plumix dev` terminal
// tagged `[browser]`, with each frame sourcemapped back to original `file:line`
// through the same Node resolver the overlay's frame view uses. All logic is pure
// over injected deps (`resolveStack` / `print`), so it tests without a live
// server; the collapse state lives on the forwarder instance the middleware keeps
// for the dev session. Nothing here ships to production — the whole path is gated
// on `process.env.PLUMIX_DEV` at the call site and tree-shakes out. The wire
// contract (`ForwardedLog`) is shared from `@plumix/blocks` so client and server
// agree on the shape.

export interface TerminalForwardDeps {
  /** Map a raw browser stack to original-source frames (the dev sourcemaps). */
  readonly resolveStack: (stack: string) => Promise<DevErrorFrame[]>;
  /** Emit one formatted block to the terminal (one `logger.info` call). */
  readonly print: (message: string) => void;
  /** The project root, so absolute frame paths print project-relative. */
  readonly root: string;
}

const TAG = "[browser]";

/** Format one resolved log into the terminal block (no trailing newline). */
export function formatForwardedLog(
  log: ForwardedLog,
  frames: readonly DevErrorFrame[],
  root: string,
): string {
  if (log.kind === "console") {
    const location = frameLocation(pickFrame(frames), root);
    const suffix = location ? ` (${location})` : "";
    return `${headerOf(log)}${suffix}`;
  }
  const appFrames = frames.filter((f) => !f.isVendor);
  const shown = appFrames.length > 0 ? appFrames : frames;
  const lines = shown.map((f) => `    at ${frameLabel(f, root)}`);
  const hidden = frames.length - shown.length;
  if (hidden > 0) {
    lines.push(`    … ${hidden} framework frame${hidden === 1 ? "" : "s"}`);
  }
  return [headerOf(log), ...lines].join("\n");
}

// The `[browser]`-tagged headline, shared by the full block and the collapsed
// repeat line so a repeat reads identically minus the stack.
function headerOf(log: ForwardedLog): string {
  const label = log.label ? `${log.label} ` : "";
  const kind = log.kind === "console" ? `console.${log.level}: ` : "";
  return `${TAG} ${kind}${label}${log.message}`;
}

/**
 * Create the stateful forwarder the Vite middleware holds for the dev session.
 * `handle` parses a POSTed `{ logs }` batch, resolves each stack, and prints —
 * collapsing consecutive identical logs into a running `(×N)` count so a tight
 * loop doesn't re-dump the same block.
 */
export function createTerminalForwarder(deps: TerminalForwardDeps): {
  handle: (body: string) => Promise<{ readonly status: number }>;
} {
  let lastSignature: string | null = null;
  let repeat = 0;

  async function emit(log: ForwardedLog): Promise<void> {
    // Resolve frames BEFORE touching the collapse state, so the compare-and-print
    // below is one synchronous critical section with no `await` inside it. Two
    // overlapping POSTs (separate client flushes) then can't interleave
    // `lastSignature`/`repeat` across a suspension point.
    const frames = log.stack ? await deps.resolveStack(log.stack) : [];
    const signature = signatureOf(log);
    if (signature === lastSignature) {
      repeat += 1;
      deps.print(`${headerOf(log)} (×${repeat})`);
      return;
    }
    lastSignature = signature;
    repeat = 1;
    deps.print(formatForwardedLog(log, frames, deps.root));
  }

  return {
    async handle(body: string): Promise<{ readonly status: number }> {
      let logs: unknown;
      try {
        logs = (JSON.parse(body) as { logs?: unknown }).logs;
      } catch {
        return { status: 400 };
      }
      if (!Array.isArray(logs)) return { status: 400 };
      for (const entry of logs) {
        const log = asForwardedLog(entry);
        if (log) await emit(log);
      }
      return { status: 200 };
    },
  };
}

function signatureOf(log: ForwardedLog): string {
  return `${log.kind}|${log.level}|${log.label ?? ""}|${log.message}`;
}

// The first application frame, falling back to the first frame of any kind, so a
// console log that only ran through framework code still shows a location.
function pickFrame(
  frames: readonly DevErrorFrame[],
): DevErrorFrame | undefined {
  return frames.find((f) => !f.isVendor) ?? frames[0];
}

function frameLabel(frame: DevErrorFrame, root: string): string {
  const location = frameLocation(frame, root);
  return frame.functionName ? `${frame.functionName} (${location})` : location;
}

function frameLocation(frame: DevErrorFrame | undefined, root: string): string {
  if (!frame) return "";
  const column = frame.column !== undefined ? `:${frame.column}` : "";
  return `${shorten(frame.file, root)}:${frame.line}${column}`;
}

// Project-relative when the file lives under the root; left absolute otherwise
// (a workspace-symlinked package, a dependency) so the path stays resolvable.
function shorten(file: string, root: string): string {
  const base = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(base) ? file.slice(base.length) : file;
}

const FORWARD_LEVELS = new Set(["error", "warn", "log", "info", "debug"]);

function isForwardLevel(value: unknown): value is ForwardedLog["level"] {
  return typeof value === "string" && FORWARD_LEVELS.has(value);
}

function asForwardedLog(value: unknown): ForwardedLog | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const { kind, level, message } = record;
  if (kind !== "console" && kind !== "exception") return null;
  if (!isForwardLevel(level)) return null;
  if (typeof message !== "string") return null;
  return {
    kind,
    level,
    // `message`/`label` are client-controlled (an island's thrown message or a
    // `console.error` arg — possibly content-authored in a CMS), so strip control
    // bytes before they reach the terminal: an ESC survives the JSON round-trip
    // and would otherwise inject ANSI/OSC escapes into the developer's console.
    message: stripControl(message),
    ...(typeof record.stack === "string" ? { stack: record.stack } : {}),
    ...(typeof record.label === "string"
      ? { label: stripControl(record.label) }
      : {}),
  };
}

// C0 control bytes + DEL are replaced with a space; a raw ESC survives the JSON
// round-trip and would otherwise inject ANSI/OSC escapes into the dev terminal.
// Frame paths are server-derived, so only `message`/`label` need this.
function stripControl(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out;
}
