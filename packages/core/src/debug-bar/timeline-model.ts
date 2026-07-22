import type { TelemetrySpan } from "../context/telemetry.js";

/** A span flattened into a single waterfall row. */
interface TimelineRow {
  readonly name: string;
  /** Nesting depth; 0 for a root span. */
  readonly depth: number;
  /** Start offset from the timeline window's start, in ms. */
  readonly offsetMs: number;
  readonly durationMs: number;
}

export interface Timeline {
  readonly rows: readonly TimelineRow[];
  /** Window span: latest end minus earliest start, in ms. */
  readonly totalMs: number;
}

/**
 * Flattens a trace-span tree into an ordered list of waterfall rows, each
 * positioned relative to the request's overall time window. Pure — the panel
 * feeds it {@link TelemetrySpan} roots from the collector and renders the result.
 */
export function buildTimeline(roots: readonly TelemetrySpan[]): Timeline {
  let windowStart = Infinity;
  let windowEnd = -Infinity;
  const visit = (span: TelemetrySpan): void => {
    windowStart = Math.min(windowStart, span.startedAt);
    windowEnd = Math.max(windowEnd, span.startedAt + span.durationMs);
    for (const child of span.children) visit(child);
  };
  for (const root of roots) visit(root);
  if (roots.length === 0) return { rows: [], totalMs: 0 };

  const rows: TimelineRow[] = [];
  const flatten = (span: TelemetrySpan, depth: number): void => {
    rows.push({
      name: span.name,
      depth,
      offsetMs: span.startedAt - windowStart,
      durationMs: span.durationMs,
    });
    for (const child of span.children) flatten(child, depth + 1);
  };
  for (const root of roots) flatten(root, 0);

  return { rows, totalMs: windowEnd - windowStart };
}
