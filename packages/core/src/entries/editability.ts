import type { CapabilityErrors } from "../rpc/errors.js";
import type { EntryRow, EntryViewer } from "./visibility.js";
import {
  entryCapabilityByName,
  entryCapabilityNamespace,
  namespacedEntryCapability,
} from "./capabilities.js";

/**
 * What the edit rule reads off a row. Derived from the read side's shape so a
 * column added there cannot silently diverge, minus `status`: unlike reading,
 * editing does not depend on where the row sits in its lifecycle.
 */
export type EntryEditRow = Omit<EntryRow, "status">;

/**
 * Whether this caller may edit this entry row: their own with `edit_own`, or
 * anyone's with `edit_any`. The one answer for every write surface, as
 * `canReadEntry` is for every read one — and the reason neither core nor a
 * plugin spells an `entry:<type>:*` capability by hand, which would miss the
 * namespace a pooled type gates under.
 */
export function canEditEntry(ctx: EntryViewer, entry: EntryEditRow): boolean {
  const namespace = entryCapabilityNamespace(ctx.plugins, entry.type);
  if (ctx.auth.can(namespacedEntryCapability(namespace, "edit_any")))
    return true;
  // An authorless row and an anonymous caller each own nothing, and neither
  // `null` nor `undefined` compares equal to an id, so both stop here.
  if (entry.authorId !== ctx.user?.id) return false;
  return ctx.auth.can(namespacedEntryCapability(namespace, "edit_own"));
}

export type EntryEditErrors = CapabilityErrors;

/**
 * `canEditEntry` as a procedure's gate.
 *
 * Every denial reports `edit_any`, the row's author included. Reporting
 * `edit_own` to an author and `edit_any` to everyone else would answer "did I
 * write this?" for a caller who cannot see the row, so the payload is the same
 * sentence regardless of who asks.
 */
export function assertCanEditEntry(
  ctx: EntryViewer,
  entry: EntryEditRow,
  errors: EntryEditErrors,
): void {
  if (canEditEntry(ctx, entry)) return;
  throw errors.FORBIDDEN({
    data: {
      capability: entryCapabilityByName(ctx.plugins, entry.type, "edit_any"),
    },
  });
}

// The capability a delete is refused for, or null when it is allowed.
function deleteDenial(ctx: EntryViewer, entry: EntryEditRow): string | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, entry.type);
  const deleteCapability = namespacedEntryCapability(namespace, "delete");
  if (!ctx.auth.can(deleteCapability)) return deleteCapability;
  if (entry.authorId === ctx.user?.id) return null;
  const editAnyCapability = namespacedEntryCapability(namespace, "edit_any");
  return ctx.auth.can(editAnyCapability) ? null : editAnyCapability;
}

/**
 * Whether this caller may delete this entry row — trash it, restore it or
 * purge it: `delete`, and for anyone else's row `edit_any` as well. Distinct
 * from `canEditEntry` by design, since `edit_own` alone deletes nothing and
 * `delete` alone edits nothing.
 */
export function canDeleteEntry(ctx: EntryViewer, entry: EntryEditRow): boolean {
  return deleteDenial(ctx, entry) === null;
}

/**
 * `canDeleteEntry` as a procedure's gate. The denial names the capability the
 * caller lacks: `delete` when they hold none, `edit_any` when the row is
 * someone else's.
 */
export function assertCanDeleteEntry(
  ctx: EntryViewer,
  entry: EntryEditRow,
  errors: EntryEditErrors,
): void {
  const capability = deleteDenial(ctx, entry);
  if (capability === null) return;
  throw errors.FORBIDDEN({ data: { capability } });
}
