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
 * Shared assertion / state helpers for both spy flavours. `self` is a
 * thunk so the methods return the concrete spy type for chaining — the
 * base only knows how to count and reset the call array.
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
 * Install a recording filter on the named hook. By default it's a
 * pass-through; call `.override(fn)` to transform the value. Still records
 * every invocation regardless.
 *
 * @remarks
 * Identity note: the hook registry `structuredClone`s each filter input
 * before passing it to listeners, so `spy.calls[i].input` is a clone, not
 * the caller-supplied reference. Use equality matchers
 * (`deepEqual` / `toEqual` / `toMatchObject`) — not identity / `toBe`.
 */
export function spyFilter<TName extends FilterName>(
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

  const label = `spyFilter(${name})`;
  const spy: FilterSpy<FilterInput<TName>, FilterRest<TName>> = {
    ...buildSpyBase<
      FilterCall<FilterInput<TName>, FilterRest<TName>>,
      FilterSpy<FilterInput<TName>, FilterRest<TName>>
    >(label, calls, () => spy),
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
    override(fn) {
      transform = fn;
    },
  };
  return spy;
}

/**
 * Assert that a promise rejects with a specific error code (and optionally
 * matches a partial data shape). Replaces the widely-copied
 * `.rejects.toMatchObject({ code, data })` idiom.
 *
 * Runner-agnostic — throws plain Errors, so it works under vitest, jest,
 * node:test, bun test, or anything that surfaces thrown errors as failures.
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
