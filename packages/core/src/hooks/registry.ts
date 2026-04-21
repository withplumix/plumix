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
import { hookStore } from "../context/stores.js";
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
    let current: unknown = input;
    for (const entry of sorted) {
      // structuredClone isolates each filter — mutations inside one filter
      // can't leak into the next. Clone cost is negligible vs. hook work.
      const snapshot = structuredClone(current);
      current = await hookStore.run({ hook: name, plugin: entry.plugin }, () =>
        entry.fn(snapshot, ...(rest as unknown[])),
      );
    }
    return current as FilterInput<TName>;
  }

  async doAction<TName extends ActionName>(
    name: TName,
    ...args: ActionArgs<TName>
  ): Promise<void> {
    const entries = this.#actions.get(name);
    if (!entries || entries.length === 0) return;

    const sorted = sortEntries(entries);
    const invocations = sorted.map((entry) =>
      hookStore.run({ hook: name, plugin: entry.plugin }, () =>
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

  listFilters(name: string): readonly FilterEntry[] {
    return this.#filters.get(name) ?? [];
  }

  listActions(name: string): readonly ActionEntry[] {
    return this.#actions.get(name) ?? [];
  }
}

function sortEntries<T extends { priority: number; insertOrder: number }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) => a.priority - b.priority || a.insertOrder - b.insertOrder,
  );
}
