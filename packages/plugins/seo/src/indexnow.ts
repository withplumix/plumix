import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { buildEntryPermalink, withBasePath } from "plumix";
import { tryGetContext } from "plumix/plugin";

import { readSeoOverrides } from "./overrides.js";
import { loadSeoSettings } from "./settings.js";

// The shared endpoint: one submission reaches every participating engine, so a
// site does not hold a key per search engine.
const ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Where the key file answers. IndexNow proves ownership by fetching a file
 * containing the key; the submission names this path as `keyLocation`, which
 * is what lets it live at a fixed path rather than at `<key>.txt` — a route
 * this plugin could not claim, since the key is a runtime answer and routes
 * are registered at boot.
 */
const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

// Long enough for a slow endpoint, short enough that a stalled submission
// cannot hold a worker open until the platform kills it.
const TIMEOUT_MS = 5000;

/**
 * `GET /indexnow-key.txt` — the ownership proof the submission points at. A
 * site with no key has nothing to prove, so the path is not a document.
 */
async function handleIndexNowKey(ctx: AppContext): Promise<Response> {
  const { indexNowKey } = await loadSeoSettings(ctx);
  if (indexNowKey === null) return new Response("Not found", { status: 404 });
  return new Response(indexNowKey, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Tell the search engines an entry moved, if it is one they may have. Every
 * gate the head and the sitemap apply is applied here too — a page nobody may
 * index is a page nobody is told about.
 */
async function submit(ctx: AppContext, entry: Entry): Promise<void> {
  if (entry.status !== "published") return;
  if (ctx.plugins.entryTypes.get(entry.type)?.isPublic === false) return;
  if (readSeoOverrides(entry.meta).noindex) return;

  const settings = await loadSeoSettings(ctx);
  if (settings.indexNowKey === null) return;
  // The two site-wide arms of `indexable` an entry cannot answer for itself,
  // asked here the way the sitemap asks them of a whole scope.
  if (!settings.indexable || settings.noindexTypes.has(entry.type)) return;

  const path = await buildEntryPermalink(ctx, entry);
  if (path === null) return;

  const response = await ctx.fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      host: new URL(ctx.origin).host,
      key: settings.indexNowKey,
      keyLocation: `${ctx.origin}${withBasePath(INDEXNOW_KEY_PATH, ctx.basePath)}`,
      urlList: [`${ctx.origin}${path}`],
    }),
  });
  // A key the engines cannot verify comes back as a refusal, not as a thrown
  // request — the one failure an operator has to be told about, since nothing
  // else reveals that notification has been silently doing nothing.
  if (!response.ok) {
    ctx.logger.warn("indexnow submission was refused", {
      status: response.status,
    });
  }
}

function notify(entry: Entry): void {
  // A lifecycle action always fires inside a request; one fired outside has no
  // context to read settings or defer through.
  const ctx = tryGetContext();
  if (ctx === null) return;
  ctx.defer(
    // Memoized per entry per request: publishing fires `entry:updated` and
    // `entry:published`, and both land here, but one publish is one
    // submission — a duplicate is what an endpoint's abuse handling watches
    // for.
    ctx
      .memo(`indexnow:${String(entry.id)}`, () => submit(ctx, entry))
      .catch((error: unknown) => {
        ctx.logger.warn("indexnow submission failed", { error });
      }),
  );
}

/**
 * Notify the engines that an entry published or changed, and serve the key
 * file that proves the site is allowed to.
 *
 * The submission is deferred, so it never joins the request the editor is
 * waiting on, and every failure is swallowed into a log line: an unreachable
 * endpoint is a missed notification, not a failed publish.
 */
export function registerIndexNow(ctx: PluginSetupContext): void {
  ctx.registerPublicRoute({
    path: INDEXNOW_KEY_PATH,
    handler: (_request, appCtx) => handleIndexNowKey(appCtx),
  });
  ctx.addAction("entry:published", notify);
  ctx.addAction("entry:updated", notify);
}
