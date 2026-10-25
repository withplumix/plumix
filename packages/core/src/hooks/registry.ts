import type { AppContext } from "../context/app-context.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type {
  EventDefinition,
  EventFailure,
  EventHandler,
  FilterDefinition,
  FilterHandler,
  HandlerOrder,
} from "./define.js";
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
import { logErrorSafely } from "../context/log.js";
import { hookStore, pluginStore, tryGetContext } from "../context/stores.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { HookExecutionError } from "./errors.js";
import { DEFAULT_HOOK_PRIORITY } from "./types.js";

interface FilterEntry {
  readonly plugin: string | null;
  readonly priority: number;
  readonly insertOrder: number;
  /**
   * One map holds every filter name, which is an existential TypeScript can't
   * spell. The erasure is undone once, where each pipeline returns through
   * `as FilterInput<TName>`, and never reaches a caller.
   */
  // eslint-disable-next-line plumix/no-unknown-return
  readonly fn: (value: unknown, ...rest: unknown[]) => unknown;
}

interface ActionEntry {
  readonly plugin: string | null;
  readonly priority: number;
  readonly insertOrder: number;
  /** Actions are fire-and-forget by contract — see `ActionFn`. */
  readonly fn: (...args: unknown[]) => void | Promise<void>;
}

interface Subscription {
  readonly plugin: string | null;
  readonly order: HandlerOrder | undefined;
  /** The plugin's place in the site's `plugins` config; core's is `CORE_RANK`. */
  readonly rank: number;
  readonly insertOrder: number;
  /**
   * One map holds every declaration's handlers, which is an existential
   * TypeScript can't spell; `emit` and `apply` undo the erasure.
   */
  // eslint-disable-next-line plumix/no-unknown-return
  readonly handler: (...args: unknown[]) => unknown;
}

export interface SubscribeOptions {
  readonly order?: HandlerOrder;
  /** `null` or absent for core's own handlers. */
  readonly plugin?: string | null;
  readonly rank?: number;
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
  /**
   * For a caller that has to know each listener's outcome, which `doAction`
   * logs and swallows.
   */
  getActionHandlers<TName extends ActionName>(
    name: TName,
  ): readonly {
    readonly fn: ActionFn<TName>;
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
  readonly #eventHandlers = new Map<string, Subscription[]>();
  readonly #filterHandlers = new Map<string, Subscription[]>();
  #counter = 0;
  readonly #onActionFailure: OnActionFailure;

  constructor(options: HookRegistryOptions = {}) {
    this.#onActionFailure =
      options.onActionFailure ??
      (({ hook, plugin, error }) => {
        const message = `[plumix] action failed hook=${hook} plugin=${plugin ?? "core"}`;
        // Outside a request (boot) no app logger is reachable yet.
        const ctx = tryGetContext();
        if (ctx === null) {
          console.error(message, error);
          return;
        }
        logErrorSafely(ctx.logger, message, error, { hook, plugin });
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

  on<TPayload>(
    event: EventDefinition<TPayload>,
    handler: EventHandler<TPayload>,
    options: SubscribeOptions = {},
  ): void {
    this.#subscribe(this.#eventHandlers, event.id, handler, options);
  }

  add<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    handler: FilterHandler<TValue, TInput, TSync>,
    options: SubscribeOptions = {},
  ): void {
    this.#subscribe(this.#filterHandlers, filter.id, handler, options);
  }

  #subscribe(
    handlers: Map<string, Subscription[]>,
    id: string,
    // eslint-disable-next-line plumix/no-unknown-return
    handler: (...args: never[]) => unknown,
    options: SubscribeOptions,
  ): void {
    const entries = handlers.get(id) ?? [];
    entries.push({
      plugin: options.plugin ?? null,
      order: options.order,
      rank: options.rank ?? CORE_RANK,
      insertOrder: this.#counter++,
      handler: handler as Subscription["handler"],
    });
    handlers.set(id, entries);
  }

  /** An event's handlers in the order `emit` starts them, for a caller that moves them. */
  getEventHandlers<TPayload>(event: EventDefinition<TPayload>): readonly {
    readonly handler: EventHandler<TPayload>;
    readonly plugin: string | null;
  }[] {
    return sortSubscriptions(this.#eventHandlers.get(event.id) ?? []).map(
      (entry) => ({
        // Safety: subscribed through `on`, so typed `EventHandler`.
        handler: entry.handler as EventHandler<TPayload>,
        plugin: entry.plugin,
      }),
    );
  }

  async emit<TPayload>(
    event: EventDefinition<TPayload>,
    payload: TPayload,
    ctx: AppContext,
  ): Promise<readonly EventFailure[]> {
    const sorted = sortSubscriptions(this.#eventHandlers.get(event.id) ?? []);
    const runs = sorted.map((entry) =>
      startHandler(() =>
        runTraced(
          ctx.telemetry,
          "event",
          event.id,
          entry.plugin,
          // Safety: subscribed through `on`, so typed `EventHandler`.
          () => entry.handler(payload, ctx) as void | Promise<void>,
        ),
      ),
    );
    const results = await Promise.allSettled(runs);
    const failures: EventFailure[] = [];
    for (const [index, result] of results.entries()) {
      const entry = sorted[index];
      if (result.status === "fulfilled" || entry === undefined) continue;
      failures.push({ plugin: entry.plugin, error: result.reason });
      logErrorSafely(
        ctx.logger,
        `[plumix] event failed event=${event.id} plugin=${entry.plugin ?? "core"}`,
        result.reason,
        { event: event.id, plugin: entry.plugin },
      );
    }
    return failures;
  }

  apply<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    value: TValue,
    input: TInput | undefined,
    ctx: AppContext,
  ): TSync extends true ? TValue : Promise<TValue> {
    const sorted = sortSubscriptions(this.#filterHandlers.get(filter.id) ?? []);
    if (filter.sync) {
      let current: unknown = value;
      for (const entry of sorted) {
        current = pluginStore.run(entry.plugin, () =>
          entry.handler(current, input, ctx),
        );
      }
      return current as TSync extends true ? TValue : Promise<TValue>;
    }
    return applyAsync(
      filter.id,
      sorted,
      value,
      input,
      ctx,
    ) as TSync extends true ? TValue : Promise<TValue>;
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

  getActionHandlers<TName extends ActionName>(
    name: TName,
  ): readonly {
    readonly fn: ActionFn<TName>;
    readonly plugin: string | null;
  }[] {
    const entries = this.#actions.get(name);
    if (!entries || entries.length === 0) return [];
    return sortEntries(entries).map((entry) => ({
      fn: entry.fn as ActionFn<TName>,
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

const CORE_RANK = -1;

const ORDER_BANDS: Readonly<Record<HandlerOrder | "normal", number>> = {
  early: 0,
  normal: 1,
  late: 2,
};

function sortSubscriptions(entries: readonly Subscription[]): Subscription[] {
  return [...entries].sort(
    (a, b) =>
      ORDER_BANDS[a.order ?? "normal"] - ORDER_BANDS[b.order ?? "normal"] ||
      a.rank - b.rank ||
      a.insertOrder - b.insertOrder,
  );
}

async function applyAsync<TValue>(
  id: string,
  sorted: readonly Subscription[],
  value: TValue,
  input: unknown,
  ctx: AppContext,
): Promise<TValue> {
  let current: unknown = value;
  for (const entry of sorted) {
    const snapshot = isolate(current);
    current = await runTraced(ctx.telemetry, "filter", id, entry.plugin, () =>
      entry.handler(snapshot, input, ctx),
    );
  }
  return current as TValue;
}

/** Starts `run` now; a throw before its first `await` rejects like one after. */
function startHandler(run: () => void | PromiseLike<void>): Promise<void> {
  return new Promise((resolve) => {
    resolve(run());
  });
}

function runTraced<T>(
  telemetry: TelemetryCollector,
  kind: "event" | "filter",
  id: string,
  plugin: string | null,
  fn: () => T,
): T {
  return telemetry.span(`${kind}: ${id}`, (s) => {
    s.set(`${kind}.id`, id);
    s.set(`${kind}.plugin`, plugin);
    return pluginStore.run(plugin, fn);
  });
}

/**
 * A payload carrying a function (the theme's `titleTemplate`) can't be cloned,
 * so it goes uncopied rather than failing the page.
 */
function isolate<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== "DataCloneError")
      throw error;
    return value;
  }
}

/**
 * The registry is app-scoped but telemetry is request-scoped; outside a request
 * handlers run untraced.
 */
function requestTelemetry(): TelemetryCollector {
  return tryGetContext()?.telemetry ?? NOOP_TELEMETRY;
}

/**
 * One handler execution = one `hook:` span wrapping the existing hookStore
 * frame — shared by the traced pipelines (applyFilter, doAction).
 */
function runHandlerTraced<T>(
  telemetry: TelemetryCollector,
  name: string,
  plugin: string | null,
  fn: () => T,
): T {
  return telemetry.span(`hook: ${name}`, (s) => {
    s.set("hook.name", name);
    s.set("hook.plugin", plugin);
    return hookStore.run({ hook: name, plugin }, () =>
      pluginStore.run(plugin, fn),
    );
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
