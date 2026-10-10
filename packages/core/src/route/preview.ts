import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import { verifyPreviewToken } from "../auth/preview-token.js";

export function readPreviewToken(ctx: AppContext): string | null {
  return new URL(ctx.request.url).searchParams.get("preview");
}

/**
 * Whether the request's `?preview=` token was minted for this exact entry.
 * Trash is never previewable.
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
