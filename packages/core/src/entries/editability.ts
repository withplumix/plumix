import type { CapabilityErrors } from "../rpc/errors.js";
import type { EntryRow, EntryViewer } from "./visibility.js";
import {
  entryCapability,
  entryCapabilityByName,
  entryCapabilityNamespace,
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
  if (ctx.auth.can(entryCapability(namespace, "edit_any"))) return true;
  // An authorless row and an anonymous caller each own nothing, and neither
  // `null` nor `undefined` compares equal to an id, so both stop here.
  if (entry.authorId !== ctx.user?.id) return false;
  return ctx.auth.can(entryCapability(namespace, "edit_own"));
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
