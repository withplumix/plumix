import type { EventDefinition, FilterDefinition } from "../hooks/define.js";
import type { HookRegistry } from "../hooks/registry.js";
import type {
  ActionArgs,
  ActionName,
  FilterInput,
  FilterName,
  FilterRest,
} from "../hooks/types.js";
import { partialMatch } from "./match.js";

export interface ActionCall<TArgs extends readonly unknown[]> {
  readonly args: TArgs;
}

export interface EventCall<TPayload> {
  readonly payload: TPayload;
}

export interface FilterCall<TValue, TRest extends readonly unknown[]> {
  readonly input: TValue;
  readonly rest: TRest;
}

interface SpyBaseReadonly<TCall> {
  readonly called: boolean;
  readonly callCount: number;
  readonly calls: readonly TCall[];
}

export interface ActionSpy<
  TArgs extends readonly unknown[],
> extends SpyBaseReadonly<ActionCall<TArgs>> {
  readonly lastArgs: TArgs | undefined;
  assertCalled(): ActionSpy<TArgs>;
  assertCalledOnce(): ActionSpy<TArgs>;
  assertCalledTimes(n: number): ActionSpy<TArgs>;
  assertNotCalled(): ActionSpy<TArgs>;
  assertCalledWith(
    matcher: (...args: TArgs) => boolean | void,
  ): ActionSpy<TArgs>;
  reset(): void;
}

export interface EventSpy<TPayload> extends SpyBaseReadonly<
  EventCall<TPayload>
> {
  readonly lastPayload: TPayload | undefined;
  assertCalled(): EventSpy<TPayload>;
  assertCalledOnce(): EventSpy<TPayload>;
  assertCalledTimes(n: number): EventSpy<TPayload>;
  assertNotCalled(): EventSpy<TPayload>;
  assertCalledWith(
    matcher: (payload: TPayload) => boolean | void,
  ): EventSpy<TPayload>;
  reset(): void;
}

export interface FilterSpy<
  TValue,
  TRest extends readonly unknown[],
> extends SpyBaseReadonly<FilterCall<TValue, TRest>> {
  readonly lastInput: TValue | undefined;
  assertCalled(): FilterSpy<TValue, TRest>;
  assertCalledOnce(): FilterSpy<TValue, TRest>;
  assertCalledTimes(n: number): FilterSpy<TValue, TRest>;
  assertNotCalled(): FilterSpy<TValue, TRest>;
  assertCalledWith(
    matcher: (input: TValue, ...rest: TRest) => boolean | void,
  ): FilterSpy<TValue, TRest>;
  /**
   * Replace the pass-through with a transform. The spy still records every
   * call, but the filter chain now sees the transform's return value.
   */
  override(
    transform: (input: TValue, ...rest: TRest) => TValue | Promise<TValue>,
  ): void;
}

/**
 * Shared helpers for both spy flavours; `self` is a thunk so methods return the
 * concrete spy type for chaining.
 */
function buildSpyBase<TCall, TSpy>(
  label: string,
  calls: TCall[],
  self: () => TSpy,
): SpyBaseReadonly<TCall> & {
  assertCalled(): TSpy;
  assertCalledOnce(): TSpy;
  assertCalledTimes(n: number): TSpy;
  assertNotCalled(): TSpy;
  reset(): void;
} {
  return {
    get called() {
      return calls.length > 0;
    },
    get callCount() {
      return calls.length;
    },
    get calls() {
      return calls;
    },
    assertCalled() {
      if (calls.length === 0) {
        throw new Error(`${label}: expected to be called, was not`);
      }
      return self();
    },
    assertCalledOnce() {
      if (calls.length !== 1) {
        throw new Error(
          `${label}: expected exactly 1 call, got ${calls.length}`,
        );
      }
      return self();
    },
    assertCalledTimes(n) {
      if (calls.length !== n) {
        throw new Error(`${label}: expected ${n} calls, got ${calls.length}`);
      }
      return self();
    },
    assertNotCalled() {
      if (calls.length > 0) {
        throw new Error(`${label}: expected no calls, got ${calls.length}`);
      }
      return self();
    },
    reset() {
      calls.length = 0;
    },
  };
}

/**
 * Install a recording listener on the named action. Captures every call's
 * args for later assertion. Adding the spy is non-destructive — other
 * listeners continue to run normally.
 */
export function spyAction<TName extends ActionName>(
  hooks: HookRegistry,
  name: TName,
): ActionSpy<ActionArgs<TName>> {
  const calls: ActionCall<ActionArgs<TName>>[] = [];
  hooks.addAction(name, ((...args: ActionArgs<TName>) => {
    calls.push({ args });
  }) as never);

  const label = `spyAction(${name})`;
  const spy: ActionSpy<ActionArgs<TName>> = {
    ...buildSpyBase<
      ActionCall<ActionArgs<TName>>,
      ActionSpy<ActionArgs<TName>>
    >(label, calls, () => spy),
    get lastArgs() {
      return calls[calls.length - 1]?.args;
    },
    assertCalledWith(matcher) {
      for (const call of calls) {
        const result = matcher(...call.args);
        if (result === true || result === undefined) return spy;
      }
      throw new Error(`${label}: no call matched the supplied matcher`);
    },
  };
  return spy;
}

/**
 * Subscribe a recording handler to the event. Other handlers run as before.
 */
export function spyEvent<TPayload>(
  hooks: HookRegistry,
  event: EventDefinition<TPayload>,
): EventSpy<TPayload> {
  const calls: EventCall<TPayload>[] = [];
  hooks.on(event, (payload) => {
    calls.push({ payload });
  });

  const label = `spyEvent(${event.id})`;
  const spy: EventSpy<TPayload> = {
    ...buildSpyBase<EventCall<TPayload>, EventSpy<TPayload>>(
      label,
      calls,
      () => spy,
    ),
    get lastPayload() {
      return calls[calls.length - 1]?.payload;
    },
    assertCalledWith(matcher) {
      for (const call of calls) {
        const result = matcher(call.payload);
        if (result === true || result === undefined) return spy;
      }
      throw new Error(`${label}: no call matched the supplied matcher`);
    },
  };
  return spy;
}

/**
 * Install a recording filter, pass-through until `.override(fn)`. An async
 * filter's values are `structuredClone`d, so match by equality, not `toBe`.
 */
export function spyFilter<TValue, TInput, TSync extends boolean>(
  hooks: HookRegistry,
  filter: FilterDefinition<TValue, TInput, TSync>,
): FilterSpy<TValue, readonly [Readonly<TInput>]>;
export function spyFilter<TName extends FilterName>(
  hooks: HookRegistry,
  name: TName,
): FilterSpy<FilterInput<TName>, FilterRest<TName>>;
export function spyFilter(
  hooks: HookRegistry,
  filter: FilterName | FilterDefinition<unknown, unknown, boolean>,
): FilterSpy<unknown, readonly unknown[]> {
  if (typeof filter === "string") return spyNamedFilter(hooks, filter);
  const calls: FilterCall<unknown, readonly [unknown]>[] = [];
  let transform: ((value: unknown, input: unknown) => unknown) | null = null;
  hooks.add(filter, (value, input) => {
    calls.push({ input: value, rest: [input] });
    return transform ? transform(value, input) : value;
  });
  return filterSpy(`spyFilter(${filter.id})`, calls, (fn) => {
    transform = fn;
  });
}

/** {@link spyFilter} bound to a harness's hooks. */
export interface BoundFilterSpy {
  <TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
  ): FilterSpy<TValue, readonly [Readonly<TInput>]>;
  <TName extends FilterName>(
    name: TName,
  ): FilterSpy<FilterInput<TName>, FilterRest<TName>>;
}

export function bindFilterSpy(hooks: HookRegistry): BoundFilterSpy {
  function bound<TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
  ): FilterSpy<TValue, readonly [Readonly<TInput>]>;
  function bound<TName extends FilterName>(
    name: TName,
  ): FilterSpy<FilterInput<TName>, FilterRest<TName>>;
  function bound(
    filter: FilterName | FilterDefinition<unknown, unknown, boolean>,
  ): FilterSpy<unknown, readonly unknown[]> {
    return typeof filter === "string"
      ? spyFilter(hooks, filter)
      : spyFilter(hooks, filter);
  }
  return bound;
}

function filterSpy<TValue, TRest extends readonly unknown[]>(
  label: string,
  calls: FilterCall<TValue, TRest>[],
  override: FilterSpy<TValue, TRest>["override"],
): FilterSpy<TValue, TRest> {
  const spy: FilterSpy<TValue, TRest> = {
    ...buildSpyBase<FilterCall<TValue, TRest>, FilterSpy<TValue, TRest>>(
      label,
      calls,
      () => spy,
    ),
    get lastInput() {
      return calls[calls.length - 1]?.input;
    },
    assertCalledWith(matcher) {
      for (const call of calls) {
        const result = matcher(call.input, ...call.rest);
        if (result === true || result === undefined) return spy;
      }
      throw new Error(`${label}: no call matched the supplied matcher`);
    },
    override,
  };
  return spy;
}

function spyNamedFilter<TName extends FilterName>(
  hooks: HookRegistry,
  name: TName,
): FilterSpy<FilterInput<TName>, FilterRest<TName>> {
  const calls: FilterCall<FilterInput<TName>, FilterRest<TName>>[] = [];
  let transform:
    | ((
        input: FilterInput<TName>,
        ...rest: FilterRest<TName>
      ) => FilterInput<TName> | Promise<FilterInput<TName>>)
    | null = null;

  hooks.addFilter(name, (async (
    input: FilterInput<TName>,
    ...rest: FilterRest<TName>
  ): Promise<FilterInput<TName>> => {
    calls.push({ input, rest });
    if (transform) return transform(input, ...rest);
    return input;
  }) as never);

  return filterSpy(`spyFilter(${name})`, calls, (fn) => {
    transform = fn;
  });
}

/**
 * Assert a promise rejects with a code and optionally a partial data shape.
 * Throws plain Errors, so it works under any test runner.
 */
export async function expectError(
  promise: Promise<unknown>,
  expected: { readonly code: string; readonly data?: unknown },
): Promise<void> {
  let caught: unknown = undefined;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error(
      `expectError: expected rejection with code="${expected.code}", promise resolved`,
    );
  }
  const actualCode = (caught as { code?: unknown }).code;
  if (actualCode !== expected.code) {
    throw new Error(
      `expectError: expected code="${expected.code}", got "${String(actualCode)}"`,
    );
  }
  if (expected.data !== undefined) {
    const actualData = (caught as { data?: unknown }).data;
    if (!partialMatch(actualData, expected.data)) {
      throw new Error(
        `expectError: data did not match — expected ${JSON.stringify(expected.data)}, got ${JSON.stringify(actualData)}`,
      );
    }
  }
}
