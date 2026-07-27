import type { AppContext } from "../context/app.js";
import type {
  TelemetryRecord,
  TelemetrySnapshot,
  TelemetrySpan,
} from "../context/telemetry.js";
import type { ResolvedEntity } from "../route/current.js";

/**
 * A bounded, fixed projection of request context — the only parts of the live
 * `AppContext` a debug panel is allowed to see. Deliberately *not* the raw
 * config or the full entity registry: a small, JSON-serializable slice so a
 * stored snapshot never pins the request graph and a future consumer (the
 * request-history store, an MCP reader) can serialize it verbatim.
 */
export interface DebugContext {
  readonly method: string;
  /** Pathname only — the query string (a secret carrier) is never captured. */
  readonly path: string;
  readonly origin: string;
  readonly basePath: string;
  readonly resolvedEntity: ResolvedEntity | null;
  readonly user: { readonly email: string; readonly role: string } | null;
  readonly tokenScopes: readonly string[] | null;
  readonly siteName: string | null;
  readonly locale: { readonly code: string; readonly direction: string };
  /** Which optional runtime slots the config wired, by presence only. */
  readonly slots: {
    readonly cache: boolean;
    readonly storage: boolean;
    readonly mailer: boolean;
    readonly images: boolean;
  };
  readonly plugins: {
    readonly ids: readonly string[];
    readonly entryTypes: readonly string[];
    readonly termTaxonomies: readonly string[];
  };
}

/**
 * The serializable model every debug panel renders from: the request's span
 * tree, its telemetry records, and the fixed context projection. HTML is only
 * ever a rendering over this JSON — the JSON is never derived from HTML. The
 * same document is what the inline bar renders for the current request and
 * (in the request-history work) what a stored past request replays.
 */
export interface DebugSnapshot {
  readonly context: DebugContext;
  readonly spans: readonly TelemetrySpan[];
  readonly records: Readonly<Record<string, readonly TelemetryRecord[]>>;
}

/**
 * Projects the telemetry data and a fixed slice of the request context into a
 * {@link DebugSnapshot}. Pure: no transport, no store, no mutation — it reads
 * `ctx` and returns inert data. The telemetry argument is the completed
 * request's {@link TelemetrySnapshot} at request-end, or the live collector's
 * `getSpans()`/`getRecords()` reads mid-request for the inline bar; only its
 * spans and records are consumed.
 */
export function projectDebugSnapshot(
  telemetry: Pick<TelemetrySnapshot, "spans" | "records">,
  ctx: AppContext,
): DebugSnapshot {
  const url = new URL(ctx.request.url);
  return {
    context: {
      method: ctx.request.method,
      path: url.pathname,
      origin: ctx.origin,
      basePath: ctx.basePath,
      resolvedEntity: ctx.resolvedEntity,
      user: ctx.user ? { email: ctx.user.email, role: ctx.user.role } : null,
      tokenScopes: ctx.tokenScopes,
      siteName: ctx.siteName ?? null,
      locale: { code: ctx.locale.code, direction: ctx.locale.direction },
      slots: {
        cache: Boolean(ctx.cache),
        storage: Boolean(ctx.storage),
        mailer: Boolean(ctx.mailer),
        images: Boolean(ctx.imageDelivery),
      },
      plugins: {
        ids: ctx.plugins.pluginIds,
        entryTypes: [...ctx.plugins.entryTypes.keys()],
        termTaxonomies: [...ctx.plugins.termTaxonomies.keys()],
      },
    },
    spans: telemetry.spans,
    records: telemetry.records,
  };
}
