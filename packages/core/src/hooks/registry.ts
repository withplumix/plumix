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
  // One map holds every filter name, which is an existential TypeScript can't
  // spell. The erasure is undone once, where each pipeline returns through
  // `as FilterInput<TName>`, and never reaches a caller.
  // eslint-disable-next-line plumix/no-unknown-return
  readonly fn: (value: unknown, ...rest: unknown[]) => unknown;
}

interface ActionEntry {
  readonly plugin: string | null;
  readonly priority: number;
  readonly insertOrder: number;
  // Actions are fire-and-forget by contract — see `ActionFn`.
  readonly fn: (...args: unknown[]) => void | Promise<void>;
}

export interface HookExecutor {
  applyFilter<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): Promise<FilterInput<TName>>;
  /**
   * Skips the structured clone (React elements can't be cloned), so handlers
   * must treat the value as read-only. Throws if a handler returns a Promise.
   */
  applyFilterSync<TName extends FilterName>(
    name: TName,
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName>;
  /**
   * A handler that throws or returns a non-array is logged and skipped. Only
   * for array-valued filters: a scalar filter's every return would be
   * discarded.
   */
  applyFilterIsolated<TName extends FilterName>(
    name: TName,
    seed: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): FilterInput<TName>;
  /**
   * For surfaces that run handlers themselves, e.g. in parallel, rather than as
   * a pipeline.
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
      // Isolates each filter — mutations inside one filter can't leak into
      // the next. Clone cost is negligible vs. hook work.
      const snapshot = isolate(current);
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

// A payload carrying a function (the theme's `titleTemplate`) can't be cloned,
// so it goes uncopied rather than failing the page.
function isolate<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== "DataCloneError")
      throw error;
    return value;
  }
}

// The registry is app-scoped but telemetry is request-scoped; outside a request
// handlers run untraced.
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
