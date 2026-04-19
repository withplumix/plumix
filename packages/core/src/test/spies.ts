import { expect } from "vitest";

import type { HookRegistry } from "../hooks/registry.js";
import type {
  ActionArgs,
  ActionName,
  FilterInput,
  FilterName,
  FilterRest,
} from "../hooks/types.js";

export interface ActionCall<TArgs extends readonly unknown[]> {
  readonly args: TArgs;
}

export interface ActionSpy<TArgs extends readonly unknown[]> {
  readonly called: boolean;
  readonly callCount: number;
  readonly calls: readonly ActionCall<TArgs>[];
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

export interface FilterCall<TValue, TRest extends readonly unknown[]> {
  readonly input: TValue;
  readonly rest: TRest;
}

export interface FilterSpy<TValue, TRest extends readonly unknown[]> {
  readonly called: boolean;
  readonly callCount: number;
  readonly calls: readonly FilterCall<TValue, TRest>[];
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
  reset(): void;
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

  const spy: ActionSpy<ActionArgs<TName>> = {
    get called() {
      return calls.length > 0;
    },
    get callCount() {
      return calls.length;
    },
    get calls() {
      return calls;
    },
    get lastArgs() {
      return calls[calls.length - 1]?.args;
    },
    assertCalled() {
      if (calls.length === 0) {
        throw new Error(`spyAction(${name}): expected to be called, was not`);
      }
      return spy;
    },
    assertCalledOnce() {
      if (calls.length !== 1) {
        throw new Error(
          `spyAction(${name}): expected exactly 1 call, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertCalledTimes(n) {
      if (calls.length !== n) {
        throw new Error(
          `spyAction(${name}): expected ${n} calls, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertNotCalled() {
      if (calls.length > 0) {
        throw new Error(
          `spyAction(${name}): expected no calls, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertCalledWith(matcher) {
      for (const call of calls) {
        const result = matcher(...call.args);
        if (result === true || result === undefined) return spy;
      }
      throw new Error(
        `spyAction(${name}): no call matched the supplied matcher`,
      );
    },
    reset() {
      calls.length = 0;
    },
  };
  return spy;
}

/**
 * Install a recording filter on the named hook. By default it's a
 * pass-through; call `.override(fn)` to transform the value. Still records
 * every invocation regardless.
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

  const spy: FilterSpy<FilterInput<TName>, FilterRest<TName>> = {
    get called() {
      return calls.length > 0;
    },
    get callCount() {
      return calls.length;
    },
    get calls() {
      return calls;
    },
    get lastInput() {
      return calls[calls.length - 1]?.input;
    },
    assertCalled() {
      if (calls.length === 0) {
        throw new Error(`spyFilter(${name}): expected to be called, was not`);
      }
      return spy;
    },
    assertCalledOnce() {
      if (calls.length !== 1) {
        throw new Error(
          `spyFilter(${name}): expected exactly 1 call, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertCalledTimes(n) {
      if (calls.length !== n) {
        throw new Error(
          `spyFilter(${name}): expected ${n} calls, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertNotCalled() {
      if (calls.length > 0) {
        throw new Error(
          `spyFilter(${name}): expected no calls, got ${calls.length}`,
        );
      }
      return spy;
    },
    assertCalledWith(matcher) {
      for (const call of calls) {
        const result = matcher(call.input, ...call.rest);
        if (result === true || result === undefined) return spy;
      }
      throw new Error(
        `spyFilter(${name}): no call matched the supplied matcher`,
      );
    },
    override(fn) {
      transform = fn;
    },
    reset() {
      calls.length = 0;
    },
  };
  return spy;
}

/**
 * Convenience: assert an oRPC procedure rejects with a specific error code
 * (and optionally matches a data shape). Replaces the widely-copied
 * `.rejects.toMatchObject({ code, data })` idiom.
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
  const shape: Record<string, unknown> = { code: expected.code };
  if (expected.data !== undefined) {
    shape.data = expected.data;
  }
  expect(caught).toMatchObject(shape);
}
