import type { PreviewGrant } from "../auth/preview-token.js";
import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import { verifyPreviewGrant } from "../auth/preview-token.js";
import { makeAuthCan } from "../auth/with-user.js";
import { canEditEntry } from "../entries/editability.js";

export function readPreviewToken(ctx: AppContext): string | null {
  return new URL(ctx.request.url).searchParams.get("preview");
}

/**
 * Null once the minter can no longer edit the entry, so a link lives only as
 * long as that right. Trash is never previewable.
 */
export async function previewGrantFor(
  ctx: AppContext,
  entry: Entry,
): Promise<PreviewGrant | null> {
  if (entry.status === "trash") return null;
  const token = readPreviewToken(ctx);
  if (token === null) return null;
  const grant = await verifyPreviewGrant(ctx.db, token);
  if (grant?.entryId !== entry.id) return null;
  const minter = {
    plugins: ctx.plugins,
    user: grant.minter,
    auth: { can: makeAuthCan(ctx.plugins, grant.minter, null) },
  };
  return canEditEntry(minter, entry) ? grant : null;
}

export async function previewTokenGrantsEntry(
  ctx: AppContext,
  entry: Entry,
): Promise<boolean> {
  return (await previewGrantFor(ctx, entry)) !== null;
}
