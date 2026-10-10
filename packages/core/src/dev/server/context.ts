import type { AppContext } from "../../context/app-context.js";
import type { TelemetrySpan } from "../../context/telemetry.js";
import type { JsonValue } from "../../json.js";
import type { ResolvedEntity } from "../../route/current.js";
import type {
  DevErrorContext,
  DevErrorFact,
  DevErrorQuery,
  DevErrorTimeline,
  DevErrorTimelineRow,
} from "../ui/index.js";

export type DevErrorContextSource = Pick<
  AppContext,
  | "request"
  | "resolvedEntity"
  | "resolvedTemplate"
  | "telemetry"
  | "origin"
  | "config"
  | "locale"
  | "cdn"
  | "storage"
  | "mailer"
  | "imageDelivery"
  | "plugins"
>;

/**
 * Each section degrades on its own: an unresolved route, no database, or an
 * unsampled request yields an empty section rather than a throw.
 */
export function collectDevErrorContext(
  ctx: DevErrorContextSource,
): DevErrorContext {
  const spans = ctx.telemetry.getSpans();
  const entity = describeEntity(ctx.resolvedEntity);
  return {
    request: {
      method: ctx.request.method,
      url: ctx.request.url,
      headers: collectHeaders(ctx.request.headers),
    },
    route: {
      ...(entity !== undefined ? { entity } : {}),
      ...(ctx.resolvedTemplate ? { template: ctx.resolvedTemplate } : {}),
    },
    queries: collectQueries(spans),
    timeline: collectTimeline(spans),
    app: collectAppFacts(ctx),
  };
}

function collectHeaders(headers: Headers): DevErrorFact[] {
  const facts: DevErrorFact[] = [];
  headers.forEach((value, label) => facts.push({ label, value }));
  return facts;
}

function describeEntity(entity: ResolvedEntity | null): string | undefined {
  if (entity === null) return undefined;
  if (entity.kind === "entryType") return `archive: ${entity.entryType}`;
  return `${entity.kind} #${entity.id}`;
}

// `Array.isArray` widens a readonly-array union to `any[]`; a dedicated guard
// keeps the elements typed as JsonValue (mirrors the debug bar's db panel).
function isJsonArray(
  value: JsonValue | undefined,
): value is readonly JsonValue[] {
  return Array.isArray(value);
}

// Not shared with the debug bar's db panel: the error page must render when
// the bar is disabled, and it projects a different shape.
function collectQueries(spans: readonly TelemetrySpan[]): DevErrorQuery[] {
  const rows: DevErrorQuery[] = [];
  const visit = (span: TelemetrySpan): void => {
    const { "db.sql": sql, "db.batch": batch } = span.attributes;
    const failed = span.status === "error";
    if (typeof sql === "string") {
      rows.push({ sql, durationMs: span.durationMs, failed });
    } else if (isJsonArray(batch)) {
      // A failed batch reports no statement index (see `batchFailed` on
      // DevErrorQuery), so the group is flagged, never an individual row.
      for (const stmt of batch) {
        if (typeof stmt !== "object" || stmt === null || isJsonArray(stmt)) {
          continue;
        }
        if (typeof stmt.sql !== "string") continue;
        rows.push({
          sql: stmt.sql,
          failed: false,
          ...(failed ? { batchFailed: true } : {}),
        });
      }
    }
    for (const child of span.children) visit(child);
  };
  for (const span of spans) visit(span);
  return rows;
}

// Duplicates the debug bar's timeline model so the error page stays
// independent of the bar.
function collectTimeline(spans: readonly TelemetrySpan[]): DevErrorTimeline {
  if (spans.length === 0) return { rows: [], totalMs: 0 };
  let windowStart = Infinity;
  let windowEnd = -Infinity;
  const bounds = (span: TelemetrySpan): void => {
    windowStart = Math.min(windowStart, span.startedAt);
    windowEnd = Math.max(windowEnd, span.startedAt + span.durationMs);
    for (const child of span.children) bounds(child);
  };
  for (const span of spans) bounds(span);

  const rows: DevErrorTimelineRow[] = [];
  const flatten = (span: TelemetrySpan, depth: number): void => {
    rows.push({
      name: span.name,
      depth,
      offsetMs: span.startedAt - windowStart,
      durationMs: span.durationMs,
      failed: span.status === "error",
    });
    for (const child of span.children) flatten(child, depth + 1);
  };
  for (const span of spans) flatten(span, 0);
  return { rows, totalMs: windowEnd - windowStart };
}

const wired = (slot: unknown): string => (slot ? "✓" : "—");

const listKeys = (map: ReadonlyMap<string, unknown>): string =>
  [...map.keys()].join(", ") || "—";

function collectAppFacts(ctx: DevErrorContextSource): DevErrorFact[] {
  return [
    { label: "Site name", value: ctx.config.auth.magicLink?.siteName ?? "—" },
    { label: "Origin", value: ctx.origin },
    { label: "Base path", value: ctx.config.basePath || "/" },
    { label: "Locale", value: `${ctx.locale.code} (${ctx.locale.direction})` },
    {
      label: "Slots",
      value: `cdn ${wired(ctx.cdn)}, storage ${wired(ctx.storage)}, mailer ${wired(ctx.mailer)}, images ${wired(ctx.imageDelivery)}`,
    },
    { label: "Plugins", value: ctx.plugins.pluginIds.join(", ") || "—" },
    { label: "Entry types", value: listKeys(ctx.plugins.entryTypes) },
    { label: "Taxonomies", value: listKeys(ctx.plugins.termTaxonomies) },
  ];
}
