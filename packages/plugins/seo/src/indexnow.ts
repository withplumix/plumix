import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { buildEntryPermalink } from "plumix/plugin";
import { withBasePath } from "plumix/support";

import { readSeoOverrides } from "./overrides.js";
import { isCrawlableType } from "./scope.js";
import { loadSeoSettings } from "./settings.js";

/**
 * The shared endpoint: one submission reaches every participating engine, so a
 * site does not hold a key per search engine.
 */
const ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Fixed and named as `keyLocation`, since `<key>.txt` can't be routed: the key
 * is runtime data and routes register at boot.
 */
const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/**
 * Long enough for a slow endpoint, short enough that a stalled submission
 * cannot hold a worker open until the platform kills it.
 */
const TIMEOUT_MS = 5000;

async function handleIndexNowKey(ctx: AppContext): Promise<Response> {
  const { indexNowKey } = await loadSeoSettings(ctx);
  if (indexNowKey === null) return new Response("Not found", { status: 404 });
  return new Response(indexNowKey, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Applies every gate the head and sitemap apply: a page nobody may index is a
 * page nobody is told about.
 */
async function submit(ctx: AppContext, entry: Entry): Promise<void> {
  if (entry.status !== "published") return;
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (entryType?.isPublic === false) return;
  if (!isCrawlableType(entryType)) return;
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
      keyLocation: `${ctx.origin}${withBasePath(INDEXNOW_KEY_PATH, ctx.config.basePath)}`,
      urlList: [`${ctx.origin}${path}`],
    }),
  });
  // An unverifiable key comes back as a refusal, and nothing else would reveal
  // that notification is silently doing nothing.
  if (!response.ok) {
    ctx.logger.warn("indexnow submission was refused", {
      status: response.status,
    });
  }
}

function notify(entry: Entry, ctx: AppContext): void {
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
 * Submissions are deferred and failures only logged: an unreachable endpoint is
 * a missed notification, not a failed publish.
 */
export function registerIndexNow(ctx: PluginSetupContext): void {
  ctx.registerPublicRoute({
    path: INDEXNOW_KEY_PATH,
    handler: (_request, appCtx) => handleIndexNowKey(appCtx),
  });
  ctx.addAction("entry:published", notify);
  ctx.addAction("entry:updated", (entry, _previous, appCtx) =>
    notify(entry, appCtx),
  );
}
