import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Entry, EntryStatus } from "../../../db/schema/entries.js";
import type { EntryEditErrors } from "../../../entries/editability.js";
import type { EntryRouter } from "./index.js";
import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { assertCanDeleteEntry } from "../../../entries/editability.js";

export function assertCanPublishEntry(
  context: AuthenticatedAppContext,
  entry: Entry,
  errors: EntryEditErrors,
): void {
  const publishCapability = entryCapabilityByName(
    context.plugins,
    entry.type,
    "publish",
  );
  if (!context.auth.can(publishCapability)) {
    throw errors.FORBIDDEN({ data: { capability: publishCapability } });
  }
}

interface EntryStatusMove {
  readonly procedure: Extract<
    keyof EntryRouter,
    "trash" | "restore" | "publish"
  >;
  readonly covers: (from: EntryStatus, to: EntryStatus) => boolean;
  readonly assert: (
    context: AuthenticatedAppContext,
    entry: Entry,
    errors: EntryEditErrors,
  ) => void;
}

/**
 * Each status move a dedicated procedure owns, with that procedure's check.
 * A save that makes the same move runs the same check.
 */
export const ENTRY_STATUS_MOVES: readonly EntryStatusMove[] = [
  {
    procedure: "trash",
    covers: (from, to) => from !== "trash" && to === "trash",
    assert: assertCanDeleteEntry,
  },
  {
    procedure: "restore",
    covers: (from, to) => from === "trash" && to !== "trash",
    assert: assertCanDeleteEntry,
  },
  {
    procedure: "publish",
    covers: (from, to) =>
      from !== to && (to === "published" || to === "scheduled"),
    assert: assertCanPublishEntry,
  },
];

export function assertCanMoveEntryStatus(
  context: AuthenticatedAppContext,
  entry: Entry,
  to: EntryStatus,
  errors: EntryEditErrors,
): void {
  for (const move of ENTRY_STATUS_MOVES) {
    if (move.covers(entry.status, to)) move.assert(context, entry, errors);
  }
}
