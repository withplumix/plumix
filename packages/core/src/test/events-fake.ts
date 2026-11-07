import type { EventDefinition } from "../events-and-filters/define.js";
import type { Declared, PartialMatch } from "./declared.js";
import { covers, describeValue, nameOf, timesOf } from "./declared.js";
import { partialMatch } from "./match.js";

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

function describeEmitted(recorded: readonly EmittedEvent[]): string {
  if (recorded.length === 0) return "Emitted: nothing.";
  return `Emitted:\n${recorded.map(({ event, payload }) => `  - ${nameOf(event)} ${describeValue(payload)}`).join("\n")}`;
}
