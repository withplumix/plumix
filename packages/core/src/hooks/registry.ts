import type { TelemetryCollector } from "../context/telemetry.js";
import type {
  ActionArgs,
  ActionFn,
  ActionName,
  FilterFn,
  FilterInput,
  FilterName,
  FilterRest,
  HookOptions,
} from "./types.js";
import { hookStore, tryGetContext } from "../context/stores.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { HookExecutionError } from "./errors.js";
import { DEFAULT_HOOK_PRIORITY } from "./types.js";

interface FilterEntry {
  readonly plugin: string | null;
  readonly priority: number;
  readonly insertOrder: number;
  readonly fn: (value: unknown, ...rest: unknown[]) => unknown;
}

interface ActionEntry {
  readonly plugin: string | null;
  readonly priority: number;
  readonly insertOrder: number;
  readonly fn: (...args: unknown[]) => unknown;
}

export interface HookExecutor {
  applyFilter<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): Promise<FilterInput<TName>>;
  /**
   * Synchronous filter pipeline for hooks that fire inside React render
   * (e.g. `block:before_render`). Skips the structured-clone step the
   * async path performs — React elements are not structured-cloneable —
   * so handlers must treat the value as read-only by convention. Throws
   * if a registered handler returns a Promise so async-in-sync misuse
   * surfaces immediately instead of leaking a rejected value downstream.
   */
  applyFilterSync<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName>;
  /**
   * Synchronous array-accumulating filter pipeline with per-handler error
   * isolation: a handler that throws or returns a non-array is logged and
   * skipped, and the chain continues from the last good value. Used by the
   * collector surfaces (admin bar, debug bar) that gather contributions and
   * must not let one misbehaving plugin take down the whole bar. Only valid
   * for array-valued filters — the runtime treats a non-array return as the
   * skip signal, so a scalar filter's every return would be discarded.
   */
  applyFilterIsolated<TName extends FilterName>(
    name: TName,
    seed: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName>;
  /**
   * Sorted snapshot of a filter's registered handlers — for surfaces that
   * run the handlers themselves rather than as an accumulating pipeline.
   * `admin-search` is the consumer: it fans the handlers out in parallel
   * (`Promise.all`) instead of threading one result into the next.
   */
  getFilterHandlers<TName extends FilterName>(
    name: TName,
  ): readonly {
    readonly fn: FilterFn<TName>;
    readonly plugin: string | null;
  }[];
  doAction<TName extends ActionName>(
    name: TName,
    ...args: ActionArgs<TName>
  ): Promise<void>;
}

type OnActionFailure = (info: {
  hook: string;
  plugin: string | null;
  error: unknown;
}) => void;

export interface HookRegistryOptions {
  readonly onActionFailure?: OnActionFailure;
}

export class HookRegistry implements HookExecutor {
  readonly #filters = new Map<string, FilterEntry[]>();
  readonly #actions = new Map<string, ActionEntry[]>();
  #counter = 0;
  readonly #onActionFailure: OnActionFailure;

  constructor(options: HookRegistryOptions = {}) {
    this.#onActionFailure =
      options.onActionFailure ??
      (({ hook, plugin, error }) => {
        console.warn(
          `[plumix] action failed hook=${hook} plugin=${plugin ?? "core"}`,
          error,
        );
      });
  }

  addFilter<TName extends FilterName>(
    name: TName,
    fn: FilterFn<TName>,
    options: HookOptions & { plugin?: string | null } = {},
  ): void {
    const entries = this.#filters.get(name) ?? [];
    entries.push({
      plugin: options.plugin ?? null,
      priority: options.priority ?? DEFAULT_HOOK_PRIORITY,
      insertOrder: this.#counter++,
      fn,
    });
    this.#filters.set(name, entries);
  }

  addAction<TName extends ActionName>(
    name: TName,
    fn: ActionFn<TName>,
    options: HookOptions & { plugin?: string | null } = {},
  ): void {
    const entries = this.#actions.get(name) ?? [];
    entries.push({
      plugin: options.plugin ?? null,
      priority: options.priority ?? DEFAULT_HOOK_PRIORITY,
      insertOrder: this.#counter++,
      fn,
    });
    this.#actions.set(name, entries);
  }

  async applyFilter<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): Promise<FilterInput<TName>> {
    const entries = this.#filters.get(name);
    if (!entries || entries.length === 0) return input;

    const sorted = sortEntries(entries);
    const telemetry = requestTelemetry();
    let current: unknown = input;
    for (const entry of sorted) {
      // structuredClone isolates each filter — mutations inside one filter
      // can't leak into the next. Clone cost is negligible vs. hook work.
      const snapshot = structuredClone(current);
      current = await runHandlerTraced(telemetry, name, entry.plugin, () =>
        entry.fn(snapshot, ...(rest as unknown[])),
      );
    }
    return current as FilterInput<TName>;
  }

  applyFilterSync<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName> {
    const entries = this.#filters.get(name);
    if (!entries || entries.length === 0) return input;

    const sorted = sortEntries(entries);
    let current: unknown = input;
    for (const entry of sorted) {
      const next = entry.fn(current, ...(rest as unknown[]));
      if (isPromiseLike(next)) {
        throw HookExecutionError.asyncHandlerInSyncFilter({ name });
      }
      current = next;
    }
    return current as FilterInput<TName>;
  }

  applyFilterIsolated<TName extends FilterName>(
    name: TName,
    seed: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName> {
    const entries = this.#filters.get(name);
    if (!entries || entries.length === 0) return seed;

    const sorted = sortEntries(entries);
    let current: unknown = seed;
    for (const entry of sorted) {
      try {
        const next = entry.fn(current, ...(rest as unknown[]));
        if (Array.isArray(next)) {
          current = next;
        } else {
          console.error(
            `[plumix] ${name} handler returned non-array plugin=${entry.plugin ?? "core"}; contribution discarded`,
          );
        }
      } catch (error) {
        console.error(
          `[plumix] ${name} handler failed plugin=${entry.plugin ?? "core"}`,
          error,
        );
      }
    }
    return current as FilterInput<TName>;
  }

  getFilterHandlers<TName extends FilterName>(
    name: TName,
  ): readonly {
    readonly fn: FilterFn<TName>;
    readonly plugin: string | null;
  }[] {
    const entries = this.#filters.get(name);
    if (!entries || entries.length === 0) return [];
    return sortEntries(entries).map((entry) => ({
      fn: entry.fn as FilterFn<TName>,
      plugin: entry.plugin,
    }));
  }

  async doAction<TName extends ActionName>(
    name: TName,
    ...args: ActionArgs<TName>
  ): Promise<void> {
    const entries = this.#actions.get(name);
    if (!entries || entries.length === 0) return;

    const sorted = sortEntries(entries);
    const telemetry = requestTelemetry();
    const invocations = sorted.map((entry) =>
      runHandlerTraced(telemetry, name, entry.plugin, () =>
        Promise.resolve().then(() => entry.fn(...(args as unknown[]))),
      ),
    );

    const results = await Promise.allSettled(invocations);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result?.status === "rejected") {
        const entry = sorted[i];
        if (entry) {
          this.#onActionFailure({
            hook: name,
            plugin: entry.plugin,
            error: result.reason,
          });
        }
      }
    }
  }
}

// The registry is app-scoped while telemetry is request-scoped; the request
// context store bridges the two. Outside a request (build time, tests calling
// hooks directly) the no-op collector applies and handlers run untraced.
function requestTelemetry(): TelemetryCollector {
  return tryGetContext()?.telemetry ?? NOOP_TELEMETRY;
}

// One handler execution = one `hook:` span wrapping the existing hookStore
// frame — shared by the traced pipelines (applyFilter, doAction).
function runHandlerTraced<T>(
  telemetry: TelemetryCollector,
  name: string,
  plugin: string | null,
  fn: () => T,
): T {
  return telemetry.span(`hook: ${name}`, (s) => {
    s.set("hook.name", name);
    s.set("hook.plugin", plugin);
    return hookStore.run({ hook: name, plugin }, fn);
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function sortEntries<T extends { priority: number; insertOrder: number }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) => a.priority - b.priority || a.insertOrder - b.insertOrder,
  );
}
