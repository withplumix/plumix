import type { AuthenticatedAppContext } from "../../../context/app.js";
import type { Entry } from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { getAutosave } from "../../../revisions/repository.js";
import { entryCapability } from "./lifecycle.js";

/**
 * Taken as a parameter rather than built here so each caller's procedure keeps
 * its own error shapes.
 */
export interface PreviewableEntryErrors {
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
  readonly NOT_FOUND: (opts: { data: { kind: string; id: number } }) => Error;
}

export interface PreviewableEntryInput {
  readonly entryId: number;
  /** The entry types the calling procedure answers for. */
  readonly entryTypes: readonly string[];
}

/**
 * The entry as its editor currently has it, for a caller who may edit it.
 *
 * A preview carries the entry's title and excerpt, and a draft's are not public
 * yet — so the gate is the editor's own, not the read gate a published entry
 * would pass for anyone.
 *
 * The pending autosave is overlaid because on a type supporting autosave a
 * *published* entry's meta edits land on a per-user draft row rather than the
 * live one, so the live row alone would answer with the state before the
 * author's last change — exactly the question a preview procedure exists to
 * answer. `title` stays live, since the editor writes it straight to the live
 * row and publish never promotes it. Meta references are left unresolved; a
 * caller needing them resolved runs the row through `buildResolvedEntries`.
 *
 * `entryTypes` is load-bearing, and must be the caller's own registered types
 * rather than a wide or user-supplied list: unlike `entry.get`, this gate does
 * not re-check `read` or reject reserved types, so the allowlist is what keeps
 * autosave and revision rows — and types the caller never registered — out.
 */
export async function previewableEntry(
  ctx: AuthenticatedAppContext,
  input: PreviewableEntryInput,
  errors: PreviewableEntryErrors,
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
  const editAny = entryCapability(row.type, "edit_any");
  const mayEdit =
    ctx.auth.can(editAny) ||
    (row.authorId === ctx.user.id &&
      ctx.auth.can(entryCapability(row.type, "edit_own")));
  if (!mayEdit) {
    throw errors.FORBIDDEN({ data: { capability: editAny } });
  }

  const autosave = await getAutosave(ctx.db, {
    entryId: row.id,
    authorId: ctx.user.id,
  });
  return autosave === undefined
    ? row
    : {
        ...row,
        content: autosave.content,
        excerpt: autosave.excerpt,
        meta: autosave.meta,
      };
}
