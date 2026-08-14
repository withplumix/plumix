/**
 * The one lookup that turns a `single`-intent match into the entry that will
 * render — shared, and request-memoized, so the access gate and the renderer
 * resolve the *same* row from one query.
 *
 * The gate (`policyForMatch`) needs the entry's stored per-entry access choice
 * before the cache decision; the renderer (`resolveSingle`) needs the full row
 * after. Routing both through {@link resolveSingleEntry} keeps them in lockstep
 * — the gate can't pick a policy for one row while the renderer shows another —
 * and pays for at most one DB read per request.
 *
 * Memo-safety: the resolution reads only the request URL (slug/path params and
 * the `?preview=` token) and the database — never the principal — so it is
 * principal-invariant and safe under the `withUser`-shared request memo.
 */

import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { findEntryByPath } from "./path-chain.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";

/**
 * Resolve the entry a `single` intent addresses (flat `slug` or hierarchical
 * `path`), honouring a `?preview=` token for drafts. `null` when nothing
 * matches. Memoized per request per `(entryType, slug|path)`.
 */
export function resolveSingleEntry(
  ctx: AppContext,
  entryType: string,
  params: Record<string, string>,
): Promise<Entry | null> {
  const path = params.path;
  const usePath = typeof path === "string" && path !== "";
  const selector = usePath ? `p:${path}` : `s:${params.slug ?? ""}`;
  return ctx.memo(`single-entry:${entryType}:${selector}`, () =>
    findEntryForSingle(ctx, entryType, params),
  );
}

async function findEntryForSingle(
  ctx: AppContext,
  entryType: string,
  params: Record<string, string>,
): Promise<Entry | null> {
  const path = params.path;
  if (typeof path === "string" && path !== "") {
    return findEntryByPath(ctx, entryType, path.split("/"));
  }
  const slug = params.slug;
  if (typeof slug !== "string" || slug === "") return null;
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
