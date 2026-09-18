import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../context/app.js";
import type { DebugSnapshot } from "./request-history/snapshot.js";
import type {
  DebugHistoryEntry,
  DebugHistoryStore,
} from "./request-history/store.js";
import { jsonResponse, methodNotAllowed, notFound } from "../runtime/http.js";
import { collectDebugPanels } from "./debug-panels/collect.js";
import { disabledPanelIds } from "./debug-panels/config.js";
import { DebugPanelTabs } from "./debug-panels/panels-view.js";
import { renderDebugPanels } from "./debug-panels/render-panels.js";
import { DEBUG_REQUESTS_PATH } from "./request-history/path.js";

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
 * Serves the dev request-history over HTTP so the bar's switcher can list and
 * replay past requests. One of the store's surfaces, not its owner — the two
 * dev MCP tools read the same ring in-process rather than through here. JSON
 * is canonical; HTML is a rendering over it:
 *
 * - `GET /_plumix/debug/requests` → newest-first metadata list, bounded to the
 *   store's ring size.
 * - `GET /_plumix/debug/requests/<id>` → that request's {@link DebugSnapshot}.
 * - `GET /_plumix/debug/requests/<id>?format=html` → the same snapshot rendered
 *   to the bar's panel markup ({@link renderDebugPanels}) for the switcher to
 *   swap in.
 *
 * The dispatcher mounts this only under the `PLUMIX_DEV` gate, so the route —
 * and this whole module — is absent from production builds. The ring is passed
 * in: the dispatcher hands over the app's, a test hands over its own.
 */
export function handleDebugRequests(
  ctx: AppContext,
  store: DebugHistoryStore,
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
// so a past request replays faithfully; `ctx` supplies only the panel set.
function renderPanelsHtml(ctx: AppContext, snapshot: DebugSnapshot): string {
  const panels = collectDebugPanels(
    ctx.hooks,
    ctx,
    disabledPanelIds(ctx.dev?.panels),
  );
  const rendered = renderDebugPanels(panels, snapshot);
  return renderToStaticMarkup(<DebugPanelTabs rendered={rendered} />);
}
