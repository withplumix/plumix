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
import { logErrorSafely } from "../context/log.js";
import { pluginStore } from "../context/stores.js";

interface Subscription {
  readonly plugin: string | null;
  readonly order: HandlerOrder | undefined;
  /** The name `.for(name)` scoped the declaration to; `undefined` runs for any. */
  readonly scope: string | undefined;
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

/** The handlers `ctx.events` and `ctx.filters` run. */
export class HandlerRegistry {
  readonly #eventHandlers = new Map<string, Subscription[]>();
  readonly #filterHandlers = new Map<string, Subscription[]>();
  #counter = 0;

  on<TPayload>(
    event: EventDefinition<TPayload>,
    handler: EventHandler<TPayload>,
    options: SubscribeOptions = {},
  ): void {
    this.#subscribe(this.#eventHandlers, event, handler, options);
  }

  add<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    handler: FilterHandler<TValue, TInput, TSync>,
    options: SubscribeOptions = {},
  ): void {
    this.#subscribe(this.#filterHandlers, filter, handler, options);
  }

  #subscribe(
    handlers: Map<string, Subscription[]>,
    declaration: { readonly id: string; readonly scope?: string },
    // eslint-disable-next-line plumix/no-unknown-return
    handler: (...args: never[]) => unknown,
    options: SubscribeOptions,
  ): void {
    const entries = handlers.get(declaration.id) ?? [];
    entries.push({
      plugin: options.plugin ?? null,
      order: options.order,
      scope: declaration.scope,
      rank: options.rank ?? CORE_RANK,
      insertOrder: this.#counter++,
      handler: handler as Subscription["handler"],
    });
    handlers.set(declaration.id, entries);
  }

  /** Each scoped subscription, for the boot check that its name is registered. */
  scopedSubscriptions(): readonly {
    readonly id: string;
    readonly scope: string;
    readonly plugin: string | null;
  }[] {
    const scoped: { id: string; scope: string; plugin: string | null }[] = [];
    for (const handlers of [this.#eventHandlers, this.#filterHandlers]) {
      for (const [id, entries] of handlers) {
        for (const { scope, plugin } of entries) {
          if (scope !== undefined) scoped.push({ id, scope, plugin });
        }
      }
    }
    return scoped;
  }

  /** An event's handlers in the order `emit` starts them, for a caller that moves them. */
  getEventHandlers<TPayload>(event: EventDefinition<TPayload>): readonly {
    readonly handler: EventHandler<TPayload>;
    readonly plugin: string | null;
  }[] {
    return this.#matching(this.#eventHandlers, event).map((entry) => ({
      // Safety: subscribed through `on`, so typed `EventHandler`.
      handler: entry.handler as EventHandler<TPayload>,
      plugin: entry.plugin,
    }));
  }

  async emit<TPayload>(
    event: EventDefinition<TPayload>,
    payload: NoInfer<TPayload>,
    ctx: AppContext,
  ): Promise<readonly EventFailure[]> {
    const sorted = this.#matching(this.#eventHandlers, event);
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
    const sorted = this.#matching(this.#filterHandlers, filter);
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

  /** Unscoped handlers, plus those scoped to the name the declaration fires for. */
  #matching(
    handlers: Map<string, Subscription[]>,
    declaration: { readonly id: string; readonly scope?: string },
  ): Subscription[] {
    const entries = (handlers.get(declaration.id) ?? []).filter(
      (entry) => entry.scope === undefined || entry.scope === declaration.scope,
    );
    return sortSubscriptions(entries);
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
      Number(a.scope === undefined) - Number(b.scope === undefined) ||
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
