import type { AppContext } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import { verifyPreviewToken } from "../auth/preview-token.js";

export function readPreviewToken(ctx: AppContext): string | null {
  return new URL(ctx.request.url).searchParams.get("preview");
}

/**
 * True when a `?preview=<token>` token on the request grants public
 * visibility to this exact entry. Entry-scoped: the token must have been
 * minted for `entry.id`. Trash is never previewable. Shared by the flat
 * (`findEntryForSingle`) and hierarchical (`findEntryByPath`) resolvers so
 * the one draft-visibility rule lives in a single place.
 */
export async function previewTokenGrantsEntry(
  ctx: AppContext,
  entry: Entry,
): Promise<boolean> {
  if (entry.status === "trash") return false;
  const token = readPreviewToken(ctx);
  if (token === null) return false;
  return (await verifyPreviewToken(ctx.db, token)) === entry.id;
}
