import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../context/app-context.js";
import type { DebugSnapshot } from "./request-history/snapshot.js";
import type { DebugHistoryEntry } from "./request-history/store.js";
import {
  jsonResponse,
  methodNotAllowed,
  notFound,
} from "../runtime/contract/http.js";
import { collectDebugPanels } from "./debug-panels/collect.js";
import { DebugPanelTabs } from "./debug-panels/panels-view.js";
import { renderDebugPanels } from "./debug-panels/render-panels.js";
import { DEBUG_REQUESTS_PATH } from "./request-history/path.js";

interface DebugRequestListItem {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  /** Epoch ms. */
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
 * Mount only under the `PLUMIX_DEV` gate, so the route and this module are
 * absent from production builds.
 */
export function handleDebugRequests(
  ctx: AppContext,
  dev: NonNullable<AppContext["dev"]>,
): Response {
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  // The dispatcher strips any base-path prefix before routing, so `pathname`
  // is root-relative here.
  const url = new URL(ctx.request.url);
  const rest = url.pathname.slice(DEBUG_REQUESTS_PATH.length);
  if (rest === "" || rest === "/") {
    return jsonResponse(dev.history.get().map(toListItem));
  }

  // `rest` starts with `/` here — the empty/`"/"` collection case returned
  // above.
  const id = decodeURIComponent(rest.slice(1));
  const entry = dev.history.find(id);
  if (entry === undefined) return notFound("debug-request-not-found");

  if (url.searchParams.get("format") === "html") {
    return new Response(renderPanelsHtml(ctx, dev, entry.snapshot), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return jsonResponse(entry.snapshot);
}

/**
 * Panels render purely from the snapshot, never live ctx, so a past request
 * replays faithfully; `ctx` and `dev` supply only the panel set.
 */
function renderPanelsHtml(
  ctx: AppContext,
  dev: NonNullable<AppContext["dev"]>,
  snapshot: DebugSnapshot,
): string {
  const panels = collectDebugPanels(ctx.hooks, ctx, dev.panels.disabled);
  const rendered = renderDebugPanels(panels, snapshot);
  return renderToStaticMarkup(<DebugPanelTabs rendered={rendered} />);
}
