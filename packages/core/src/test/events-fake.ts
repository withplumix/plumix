import type { EventDefinition } from "../hooks/define.js";
import { partialMatch } from "./match.js";

/** What an assertion matches against: any subset of the keys, at any depth. */
export type PartialMatch<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: PartialMatch<T[K]> }
    : T;

/** An event or a filter, as its declaration names it. */
export interface Declared {
  readonly id: string;
  readonly scope?: string;
}

interface EmittedEvent {
  readonly event: Declared;
  readonly payload: unknown;
}

/**
 * Records every event the site emitted, before its handlers run. Each
 * assertion takes the declared event and throws a plain `Error` listing the
 * events actually emitted.
 */
export interface EventsFake {
  /**
   * Throws unless the event was emitted with a payload that has every key of
   * `payload`. An unscoped event matches its emits for any name.
   */
  readonly assertEmitted: <TPayload>(
    event: EventDefinition<TPayload>,
    payload?: PartialMatch<TPayload>,
  ) => void;
  readonly assertNotEmitted: <TPayload>(
    event: EventDefinition<TPayload>,
  ) => void;
  /** Each payload the event was emitted with, in order. */
  readonly emitted: <TPayload>(
    event: EventDefinition<TPayload>,
  ) => readonly TPayload[];
  readonly record: (event: Declared, payload: unknown) => void;
}

export function fakeEvents(): EventsFake {
  const recorded: EmittedEvent[] = [];

  function payloadsOf<TPayload>(
    event: EventDefinition<TPayload>,
  ): readonly TPayload[] {
    return (
      recorded
        .filter((emit) => covers(event, emit.event))
        // Safety: recorded from `emit`, which types the payload by its event.
        .map((emit) => emit.payload as TPayload)
    );
  }

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeEmitted(recorded)}`);
  }

  return {
    record: (event, payload) => {
      recorded.push({ event, payload });
    },
    emitted: payloadsOf,
    assertEmitted: (event, payload) => {
      const payloads = payloadsOf(event);
      if (payload === undefined && payloads.length > 0) return;
      if (payloads.some((emitted) => partialMatch(emitted, payload))) return;
      const wanted =
        payload === undefined ? "" : ` with ${describeValue(payload)}`;
      fail(
        `Expected event ${nameOf(event)} to be emitted${wanted}, but it was not.`,
      );
    },
    assertNotEmitted: (event) => {
      const count = payloadsOf(event).length;
      if (count === 0) return;
      fail(
        `Expected event ${nameOf(event)} not to be emitted, but it was ${timesOf(count)}.`,
      );
    },
  };
}

/** An unscoped declaration covers every scope, as its handlers do. */
export function covers(asked: Declared, fired: Declared): boolean {
  return (
    asked.id === fired.id &&
    (asked.scope === undefined || asked.scope === fired.scope)
  );
}

export function nameOf(declared: Declared): string {
  return declared.scope === undefined
    ? `"${declared.id}"`
    : `"${declared.id}" for "${declared.scope}"`;
}

export function timesOf(count: number): string {
  return count === 1 ? "once" : `${String(count)} times`;
}

export function describeValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function describeEmitted(recorded: readonly EmittedEvent[]): string {
  if (recorded.length === 0) return "Emitted: nothing.";
  return `Emitted:\n${recorded.map(({ event, payload }) => `  - ${nameOf(event)} ${describeValue(payload)}`).join("\n")}`;
}
