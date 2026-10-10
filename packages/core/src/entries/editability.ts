import type { CapabilityErrors } from "../rpc-errors.js";
import type { EntryRow, EntryViewer } from "./visibility.js";
import {
  entryCapabilityByName,
  entryCapabilityNamespace,
  namespacedEntryCapability,
} from "../access/contract/entry-capabilities.js";

/**
 * Without `status`: unlike reading, editing doesn't depend on the row's
 * lifecycle.
 */
export type EntryEditRow = Omit<EntryRow, "status">;

/**
 * Use this rather than spelling an `entry:<type>:*` capability, which would
 * miss the namespace a pooled type gates under.
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
 * Every denial reports `edit_any`, the author included, so the payload can't
 * answer "did I write this?" for a caller who can't see the row.
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

/** The capability a delete is refused for, or null when it is allowed. */
function deleteDenial(ctx: EntryViewer, entry: EntryEditRow): string | null {
  const namespace = entryCapabilityNamespace(ctx.plugins, entry.type);
  const deleteCapability = namespacedEntryCapability(namespace, "delete");
  if (!ctx.auth.can(deleteCapability)) return deleteCapability;
  if (entry.authorId === ctx.user?.id) return null;
  const editAnyCapability = namespacedEntryCapability(namespace, "edit_any");
  return ctx.auth.can(editAnyCapability) ? null : editAnyCapability;
}

/**
 * Trash, restore or purge. Needs `delete`, plus `edit_any` for another's row;
 * `edit_own` alone deletes nothing.
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
