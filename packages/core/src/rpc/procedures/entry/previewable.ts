import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Entry } from "../../../db/schema/entries.js";
import type { GatedLookupErrors } from "../../../rpc-errors.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import { getAutosave, overlayAutosave } from "../../../revisions/repository.js";

export interface PreviewableEntryInput {
  readonly entryId: number;
  /** The entry types the calling procedure answers for. */
  readonly entryTypes: readonly string[];
}

/**
 * `entryTypes` must be the caller's own registered types: this gate skips the
 * `read` check and reserved-type rejection, so the allowlist alone keeps
 * autosave and revision rows out.
 */
export async function previewableEntry(
  ctx: AuthenticatedAppContext,
  input: PreviewableEntryInput,
  errors: GatedLookupErrors,
): Promise<Entry> {
  const { entryId, entryTypes } = input;
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  // A type outside the caller's scope has no box to ask from, so the caller
  // answers for exactly the types that registered it.
  if (row === undefined || !entryTypes.includes(row.type)) {
    throw errors.NOT_FOUND({ data: { kind: "entry", id: entryId } });
  }
  assertCanEditEntry(ctx, row, errors);

  const autosave = await getAutosave(
    ctx.db,
    { entryId: row.id, authorId: ctx.user.id },
    row,
  );
  return autosave === undefined ? row : overlayAutosave(row, autosave);
}
