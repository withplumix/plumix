import type { TelemetrySnapshot, TelemetrySpan } from "../context/telemetry.js";

/**
 * Records the snapshot of every request and scheduled firing the site served,
 * as a telemetry consumer receives it.
 */
export interface TelemetryFake {
  readonly snapshots: readonly TelemetrySnapshot[];
  /**
   * The first span named `name`, at any depth, in the order the snapshots
   * were delivered. Throws an `Error` listing the spans recorded.
   */
  readonly span: (name: string) => TelemetrySpan;
  /** Takes each snapshot the site delivers. */
  readonly record: (snapshot: TelemetrySnapshot) => void;
}

export function fakeTelemetry(): TelemetryFake {
  const snapshots: TelemetrySnapshot[] = [];
  const spans = (): TelemetrySpan[] =>
    snapshots.flatMap((snapshot) => snapshot.spans.flatMap(withDescendants));

  return {
    snapshots,
    span: (name) => {
      const found = spans().find((span) => span.name === name);
      if (found !== undefined) return found;
      const names = spans().map((span) => `  ${span.name}`);
      throw new Error(
        `Expected a span named "${name}", but none was recorded.\n` +
          (names.length === 0
            ? "Recorded: no spans."
            : `Recorded:\n${names.join("\n")}`),
      );
    },
    record: (snapshot) => {
      snapshots.push(snapshot);
    },
  };
}

function withDescendants(span: TelemetrySpan): TelemetrySpan[] {
  return [span, ...span.children.flatMap(withDescendants)];
}
