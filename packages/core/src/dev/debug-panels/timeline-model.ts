import type {
  TelemetrySpan,
  TelemetrySpanLog,
} from "../../context/telemetry.js";

interface TimelineLog {
  readonly level: TelemetrySpanLog["level"];
  readonly message: string;
  /** From the timeline window's start, in ms. */
  readonly offsetMs: number;
}

interface TimelineRow {
  readonly name: string;
  /** 0 for a root span. */
  readonly depth: number;
  /** From the timeline window's start, in ms. */
  readonly offsetMs: number;
  readonly durationMs: number;
  /** The span's own logs, in call order. */
  readonly logs: readonly TimelineLog[];
  /** Set on a span that started after the response, as deferred work does. */
  readonly afterResponse?: true;
}

export interface Timeline {
  readonly rows: readonly TimelineRow[];
  /** Window span: latest end minus earliest start, in ms. */
  readonly totalMs: number;
}

/** `respondedAt` (epoch ms) marks the spans that started after it. */
export function buildTimeline(
  roots: readonly TelemetrySpan[],
  respondedAt?: number,
): Timeline {
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
      logs: span.logs.map((log) => ({
        level: log.level,
        message: log.message,
        offsetMs: log.at - windowStart,
      })),
      ...(respondedAt !== undefined &&
        span.startedAt > respondedAt && { afterResponse: true }),
    });
    for (const child of span.children) flatten(child, depth + 1);
  };
  for (const root of roots) flatten(root, 0);

  return { rows, totalMs: windowEnd - windowStart };
}
