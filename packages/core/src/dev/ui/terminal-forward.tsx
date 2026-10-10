/// <reference lib="dom" />
// `log` level is opt-in because plain logs are noisy. Load only under the dev
// gate, so this tree-shakes out of production island bundles.

import { deriveLabel, detailOf } from "../../blocks/island-events.js";
import { DEV_ERROR_TERMINAL_ENDPOINT } from "./frames.js";

/**
 * How much client output forwards, from least to most verbose: `error`, `warn`
 * (default — errors + warnings), then `log` (adds
 * `console.log`/`info`/`debug`).
 */
export type ForwardLevel = "off" | "error" | "warn" | "log";

/** One client failure forwarded to the terminal. Shared wire shape with the
 * Node-side printer (`plumix/vite`), which resolves {@link stack} to frames. */
export interface ForwardedLog {
  /**
   * `exception` for an uncaught throw; `console` for a patched console method.
   */
  readonly kind: "console" | "exception";
  /**
   * The console method for a `console` log; always `error` for an exception.
   */
  readonly level: "error" | "warn" | "log" | "info" | "debug";
  /** The human message — for an exception, `Name: message`. */
  readonly message: string;
  /** The raw browser stack, resolved to source frames server-side. */
  readonly stack?: string;
  /** The island component name (`<Counter>`), when the failure named one. */
  readonly label?: string;
}

export interface TerminalForwardOptions {
  /** What to forward; defaults to `warn`. `off` installs nothing. */
  readonly level?: ForwardLevel;
  readonly endpoint?: string;
  /**
   * Defaults to `setTimeout(0)`, which coalesces a synchronous burst into one
   * POST and, unlike `requestAnimationFrame`, still fires in a background tab.
   */
  readonly schedule?: (flush: () => void) => void;
}

/**
 * Resolve the `PLUMIX_FORWARD_ERRORS` env value to a level. Default
 * (unset/empty) is `warn` — uncaught errors plus
 * `console.error`/`console.warn`. `off`/`false` disables forwarding; `error`
 * drops warnings; `log` additionally forwards
 * `console.log`/`console.info`/`console.debug`.
 */
export function parseForwardLevel(raw: string | undefined): ForwardLevel {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "off" || value === "false") return "off";
  if (value === "error") return "error";
  if (value === "log") return "log";
  return "warn";
}

/**
 * Idempotent: a second install before teardown returns the existing teardown,
 * so an HMR re-run never double-patches console or stacks listeners.
 */
let active: TerminalForwarder | null = null;

export function installTerminalForwarding(
  options: TerminalForwardOptions = {},
): () => void {
  if (active) return active.teardown;
  const level = options.level ?? "warn";
  if (level === "off") return () => undefined;
  active = new TerminalForwarder(level, options);
  return active.install();
}

type ConsoleMethod = "error" | "warn" | "log" | "info" | "debug";

/** Which console methods each level patches, cumulative from `error` up. */
const CONSOLE_METHODS: Record<Exclude<ForwardLevel, "off">, ConsoleMethod[]> = {
  error: ["error"],
  warn: ["error", "warn"],
  log: ["error", "warn", "log", "info", "debug"],
};

class TerminalForwarder {
  private readonly target: Window = window;
  private readonly endpoint: string;
  private readonly schedule: (flush: () => void) => void;
  private readonly listeners: (() => void)[] = [];
  private readonly restores: (() => void)[] = [];
  private readonly seenObjects = new WeakSet();
  private queue: ForwardedLog[] = [];
  private scheduled = false;

  constructor(
    private readonly level: Exclude<ForwardLevel, "off">,
    options: TerminalForwardOptions,
  ) {
    this.endpoint = options.endpoint ?? DEV_ERROR_TERMINAL_ENDPOINT;
    this.schedule = options.schedule ?? defaultSchedule;
  }

  install(): () => void {
    for (const method of CONSOLE_METHODS[this.level]) this.patchConsole(method);

    this.on("plumix:island-error", (event) => this.captureEvent(event));
    this.on("plumix:hydration-error", (event) => this.captureEvent(event));
    this.on("error", (event) => {
      const error: unknown = (event as ErrorEvent).error;
      if (error == null) return;
      this.captureException(error);
    });
    this.on("unhandledrejection", (event) => {
      this.captureException((event as { reason?: unknown }).reason);
    });
    return this.teardown;
  }

  private patchConsole(method: ConsoleMethod): void {
    // `console` lives on the global scope, not the `Window` interface itself.
    const console = (this.target as Window & typeof globalThis).console;
    // Keep the original reference so teardown restores it identically; it is
    // only invoked with `.apply(console, …)`, so the unbound extraction is safe.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = console[method];
    const patched = (...args: unknown[]): void => {
      original.apply(console, args);
      // The island renderer re-logs an error it already dispatched as
      // `plumix:island-error`; skip it so the failure isn't printed twice.
      if (args.some((arg) => this.alreadyForwarded(arg))) return;
      this.enqueue({
        kind: "console",
        level: method,
        message: args.map(formatArg).join(" "),
        ...withStack(callSiteStack(patched)),
      });
    };
    console[method] = patched;
    this.restores.push(() => {
      console[method] = original;
    });
  }

  private on(type: string, handler: (event: Event) => void): void {
    this.target.addEventListener(type, handler);
    this.listeners.push(() => this.target.removeEventListener(type, handler));
  }

  private captureEvent(event: Event): void {
    const { error, element } = detailOf(event);
    this.captureException(error, element);
  }

  private captureException(error: unknown, element?: HTMLElement): void {
    if (this.isDuplicate(error)) return;
    const label = deriveLabel(element);
    this.enqueue({
      kind: "exception",
      level: "error",
      message: messageOf(error),
      ...withStack(error instanceof Error ? error.stack : undefined),
      ...(label ? { label } : {}),
    });
  }

  /**
   * True when `value` is an error object already captured as an exception —
   * read-only, so genuine repeat `console.error` strings still forward.
   */
  private alreadyForwarded(value: unknown): boolean {
    return (
      value !== null && typeof value === "object" && this.seenObjects.has(value)
    );
  }

  /**
   * Dedup only by identity: the one real double is a thrown error reaching two
   * producers. The server collapses consecutive primitive repeats into `(×N)`.
   */
  private isDuplicate(error: unknown): boolean {
    if (error === null || typeof error !== "object") return false;
    if (this.seenObjects.has(error)) return true;
    this.seenObjects.add(error);
    return false;
  }

  private enqueue(log: ForwardedLog): void {
    this.queue.push(log);
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;
    if (this.queue.length === 0) return;
    const logs = this.queue;
    this.queue = [];
    // Fire-and-forget: a forwarding failure must never surface to the page.
    void this.target
      .fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs }),
      })
      .catch(() => undefined);
  }

  readonly teardown = (): void => {
    for (const off of this.listeners) off();
    for (const restore of this.restores) restore();
    this.listeners.length = 0;
    this.restores.length = 0;
    if (active === this) active = null;
  };
}

function defaultSchedule(flush: () => void): void {
  setTimeout(flush, 0);
}

function withStack(stack: string | undefined): { stack?: string } {
  return stack ? { stack } : {};
}

function errorLabel(error: Error): string {
  return `${error.name}: ${error.message}`;
}

/** Any value can be thrown; a non-`Error` degrades to its string form. */
function messageOf(error: unknown): string {
  return error instanceof Error ? errorLabel(error) : String(error);
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return errorLabel(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * `Error.captureStackTrace` omits our wrapper frame where V8 supports it;
 * elsewhere the server drops it as a vendor frame anyway.
 */
function callSiteStack(
  origin: (...args: unknown[]) => void,
): string | undefined {
  // `captureStackTrace` is declared unconditionally by the ambient types but
  // only exists on V8; the runtime check is what covers every other engine.
  const holder: { stack?: string } = {};
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(holder, origin);
    return holder.stack;
  }
  return new Error().stack;
}
