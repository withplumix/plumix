// Request-memoized so the access gate and the renderer resolve the same row
// from one query. Memo-safe: it never reads the principal.

import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { RouteIntent } from "./contract/intent.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { findEntryByPath } from "./path-chain.js";
import { previewTokenGrantsEntry, readPreviewToken } from "./preview.js";

type EntryIntent = Extract<RouteIntent, { kind: "entry" }>;

type EntrySelector =
  | { readonly by: "slug"; readonly slug: string }
  | { readonly by: "path"; readonly path: string };

/**
 * The entry an `entry` intent addresses, honouring a `?preview=` token for
 * drafts, or `null`. Memoized per request per `(entryType, slug|path)`.
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
