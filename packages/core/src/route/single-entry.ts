/**
 * The one lookup that turns an `entry`-intent match into the entry that will
 * render — shared, and request-memoized, so the access gate and the renderer
 * resolve the *same* row from one query.
 *
 * The gate (`policyForMatch`) needs the entry's stored per-entry access choice
 * before the cache decision; the renderer (`resolveSingle`) needs the full row
 * after. Routing both through {@link resolveSingleEntry} keeps them in lockstep
 * — the gate can't pick a policy for one row while the renderer shows another —
 * and pays for at most one DB read per request.
 *
 * Memo-safety: the resolution reads only the intent, the request URL (slug/path
 * params and the `?preview=` token) and the database — never the principal — so
 * it is principal-invariant and safe under the `withUser`-shared request memo.
 */

import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { RouteIntent } from "./contract/intent.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { findEntryByPath } from "./path-chain.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";

type EntryIntent = Extract<RouteIntent, { kind: "entry" }>;

// How the entry is found: by its slug, or by walking a hierarchical path.
type EntrySelector =
  | { readonly by: "slug"; readonly slug: string }
  | { readonly by: "path"; readonly path: string };

/**
 * Resolve the entry an `entry` intent addresses (the intent's fixed `slug`,
 * else a flat `slug` or hierarchical `path` param), honouring a `?preview=`
 * token for drafts. `null` when nothing matches. Memoized per request per
 * `(entryType, slug|path)`.
 */
export function resolveSingleEntry(
  ctx: AppContext,
  intent: EntryIntent,
  params: Record<string, string>,
): Promise<Entry | null> {
  const selector = selectEntry(intent, params);
  const key =
    selector.by === "path" ? `p:${selector.path}` : `s:${selector.slug}`;
  return ctx.memo(`single-entry:${intent.entryType}:${key}`, () =>
    findEntryForSingle(ctx, intent.entryType, selector),
  );
}

// Slugs are unique per type, so a fixed slug names a nested entry too and no
// ancestor path is checked.
function selectEntry(
  intent: EntryIntent,
  params: Record<string, string>,
): EntrySelector {
  if (intent.slug !== undefined) return { by: "slug", slug: intent.slug };
  const path = params.path;
  if (typeof path === "string" && path !== "") return { by: "path", path };
  return { by: "slug", slug: params.slug ?? "" };
}

async function findEntryForSingle(
  ctx: AppContext,
  entryType: string,
  selector: EntrySelector,
): Promise<Entry | null> {
  if (selector.by === "path") {
    return findEntryByPath(ctx, entryType, selector.path.split("/"));
  }
  const { slug } = selector;
  if (slug === "") return null;
  const published = await ctx.db.query.entries.findFirst({
    where: and(
      eq(entries.type, entryType),
      eq(entries.slug, slug),
      eq(entries.status, "published"),
    ),
  });
  if (published) return published;
  // A valid `?preview=` token can reveal the matching draft. Skip the extra
  // query entirely on the common no-token 404.
  if (readPreviewToken(ctx) === null) return null;
  const candidate = await ctx.db.query.entries.findFirst({
    where: and(eq(entries.type, entryType), eq(entries.slug, slug)),
  });
  if (!candidate) return null;
  return (await previewTokenGrantsEntry(ctx, candidate)) ? candidate : null;
}
