import type { FilterDefinition } from "../hooks/define.js";
import type { Declared, PartialMatch } from "./declared.js";
import { covers, describeValue, nameOf, timesOf } from "./declared.js";
import { partialMatch } from "./match.js";

interface AppliedFilter {
  readonly filter: Declared;
  readonly input: unknown;
}

/**
 * Records every filter the site applied, with its input, before its handlers
 * run. Each assertion takes the declared filter and throws a plain `Error`
 * listing the filters actually applied.
 */
export interface FiltersFake {
  /**
   * Throws unless the filter was applied with an input that has every key of
   * `input`. An unscoped filter matches its applications for any name.
   */
  readonly assertApplied: <TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
    input?: PartialMatch<TInput>,
  ) => void;
  readonly assertNotApplied: <TValue, TInput, TSync extends boolean>(
    filter: FilterDefinition<TValue, TInput, TSync>,
  ) => void;
  readonly record: (filter: Declared, input: unknown) => void;
}

export function fakeFilters(): FiltersFake {
  const recorded: AppliedFilter[] = [];

  function inputsOf(filter: Declared): readonly unknown[] {
    return recorded
      .filter((apply) => covers(filter, apply.filter))
      .map((apply) => apply.input);
  }

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeApplied(recorded)}`);
  }

  return {
    record: (filter, input) => {
      recorded.push({ filter, input });
    },
    assertApplied: (filter, input) => {
      const inputs = inputsOf(filter);
      if (input === undefined && inputs.length > 0) return;
      if (inputs.some((applied) => partialMatch(applied, input))) return;
      const wanted = input === undefined ? "" : ` with ${describeValue(input)}`;
      fail(
        `Expected filter ${nameOf(filter)} to be applied${wanted}, but it was not.`,
      );
    },
    assertNotApplied: (filter) => {
      const count = inputsOf(filter).length;
      if (count === 0) return;
      fail(
        `Expected filter ${nameOf(filter)} not to be applied, but it was ${timesOf(count)}.`,
      );
    },
  };
}

function describeApplied(recorded: readonly AppliedFilter[]): string {
  if (recorded.length === 0) return "Applied: nothing.";
  return `Applied:\n${recorded.map(({ filter, input }) => `  - ${nameOf(filter)} ${describeValue(input)}`).join("\n")}`;
}
