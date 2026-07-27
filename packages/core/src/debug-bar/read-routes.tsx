import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../context/app.js";
import type { DebugHistoryEntry, DebugHistoryStore } from "./history.js";
import type { DebugSnapshot } from "./snapshot.js";
import { jsonResponse, methodNotAllowed, notFound } from "../runtime/http.js";
import { collectDebugPanels } from "./collect.js";
import { normalizeDebugBar } from "./config.js";
import { debugHistory } from "./history.js";
import { DebugPanelTabs } from "./panels-view.js";
import { renderDebugPanels } from "./render-panels.js";
import { DEBUG_REQUESTS_PATH } from "./requests-path.js";

/** The newest-first metadata a `GET /_plumix/debug/requests` list item carries. */
interface DebugRequestListItem {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  /** When the request began (epoch ms). */
  readonly timestamp: number;
}

function toListItem(entry: DebugHistoryEntry): DebugRequestListItem {
  return {
    id: entry.id,
    method: entry.snapshot.context.method,
    path: entry.snapshot.context.path,
    status: entry.status,
    durationMs: entry.durationMs,
    timestamp: entry.startedAt,
  };
}

/**
 * Serves the dev request-history over HTTP so the bar's switcher (and a future
 * MCP reader) can list and replay past requests. JSON is canonical; HTML is a
 * rendering over it:
 *
 * - `GET /_plumix/debug/requests` → newest-first metadata list, bounded to the
 *   store's ring size.
 * - `GET /_plumix/debug/requests/<id>` → that request's {@link DebugSnapshot}.
 * - `GET /_plumix/debug/requests/<id>?format=html` → the same snapshot rendered
 *   to the bar's panel markup ({@link renderDebugPanels}) for the switcher to
 *   swap in.
 *
 * The dispatcher mounts this only under the `PLUMIX_DEV` gate, so the route —
 * and this whole module — is absent from production builds. `store` is
 * injectable for tests; production wiring passes the module singleton.
 */
export function handleDebugRequests(
  ctx: AppContext,
  store: DebugHistoryStore = debugHistory,
): Response {
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  // The dispatcher strips any base-path prefix before routing, so `pathname`
  // is root-relative here.
  const url = new URL(ctx.request.url);
  const rest = url.pathname.slice(DEBUG_REQUESTS_PATH.length);
  if (rest === "" || rest === "/") {
    return jsonResponse(store.get().map(toListItem));
  }

  // `rest` starts with `/` here — the empty/`"/"` collection case returned above.
  const id = decodeURIComponent(rest.slice(1));
  const entry = store.find(id);
  if (entry === undefined) return notFound("debug-request-not-found");

  if (url.searchParams.get("format") === "html") {
    return new Response(renderPanelsHtml(ctx, entry.snapshot), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return jsonResponse(entry.snapshot);
}

// Render the stored snapshot through the same panels the inline bar collects
// for this request. Panels render purely from the snapshot (never live ctx),
// so a past request replays faithfully; `ctx` supplies only the panel set (the
// `debug_bar:panels` filter) and the disable denylist.
function renderPanelsHtml(ctx: AppContext, snapshot: DebugSnapshot): string {
  const { disabled } = normalizeDebugBar(ctx.debugBar);
  const panels = collectDebugPanels(ctx.hooks, ctx, disabled);
  const rendered = renderDebugPanels(panels, snapshot);
  return renderToStaticMarkup(<DebugPanelTabs rendered={rendered} />);
}
