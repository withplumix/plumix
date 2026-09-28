import type { AppContext } from "../../context/app-context.js";
import type { DebugSnapshot } from "../../context/dev-runtime.js";
import type { TelemetrySnapshot } from "../../context/telemetry.js";

export type { DebugContext, DebugSnapshot } from "../../context/dev-runtime.js";

export type DebugContextSource = Pick<
  AppContext,
  | "request"
  | "origin"
  | "config"
  | "resolvedEntity"
  | "user"
  | "tokenScopes"
  | "locale"
  | "cdn"
  | "storage"
  | "mailer"
  | "imageDelivery"
  | "plugins"
>;

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
  ctx: DebugContextSource,
): DebugSnapshot {
  const url = new URL(ctx.request.url);
  return {
    context: {
      method: ctx.request.method,
      path: url.pathname,
      origin: ctx.origin,
      basePath: ctx.config.basePath,
      resolvedEntity: ctx.resolvedEntity,
      user: ctx.user ? { email: ctx.user.email, role: ctx.user.role } : null,
      tokenScopes: ctx.tokenScopes,
      siteName: ctx.config.auth.magicLink?.siteName ?? null,
      locale: { code: ctx.locale.code, direction: ctx.locale.direction },
      slots: {
        cdn: Boolean(ctx.cdn),
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
