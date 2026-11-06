import type { Entry, EntryStatus, NewEntry } from "../db/schema/entries.js";
import type { MetaChanges } from "../meta/contract/bags.js";
import { defineEvent, defineFilter } from "./define.js";
import { scopeDeclarations } from "./scope.js";

/** An entry's events and its before-save filter, as one entry type sees them. */
const declarations = {
  /** The entry became published, by an editor, an agent or the scheduler. */
  published: defineEvent<{ readonly entry: Entry }>("entry:published"),
  /** The entry's columns changed; `previous` is the row before the write. */
  updated: defineEvent<{ readonly entry: Entry; readonly previous: Entry }>(
    "entry:updated",
  ),
  trashed: defineEvent<{ readonly entry: Entry }>("entry:trashed"),
  restored: defineEvent<{ readonly entry: Entry }>("entry:restored"),
  /** The row is gone when this fires; `entry` is its last state. */
  deleted: defineEvent<{ readonly entry: Entry }>("entry:deleted"),
  /** The status changed; fires before the status's own event. */
  transition: defineEvent<{
    readonly entry: Entry;
    readonly previousStatus: EntryStatus;
  }>("entry:transition"),
  /**
   * Only on types with `supports: ['revisions']`, after any pruning the new
   * snapshot caused. `entry` is the live entry.
   */
  revisionCreated: defineEvent<{
    readonly revision: Entry;
    readonly entry: Entry;
  }>("entry:revisionCreated"),
  /** The new snapshot pushed `prunedCount` revisions past `maxRevisions`. */
  revisionPruned: defineEvent<{
    readonly entry: Entry;
    readonly prunedCount: number;
  }>("entry:revisionPruned"),
  /**
   * A revision was restored. On `supports: ['autosave']` types `destination`
   * is the caller's autosave row; otherwise it is the live entry, and
   * `updated` fires too. Scoped by the live entry's type.
   */
  revisionRestored: defineEvent<{
    readonly revision: Entry;
    readonly destination: Entry;
  }>("entry:revisionRestored"),
  /**
   * The caller's autosave row was written. It does not fire `updated`, so a
   * cache invalidator ignores pending drafts. Scoped by the live entry's type.
   */
  autosaveSaved: defineEvent<{
    readonly autosave: Entry;
    readonly entry: Entry;
  }>("entry:autosaveSaved"),
  /** `authorId`'s autosave of the live `entry` was discarded. */
  autosaveDiscarded: defineEvent<{
    readonly entry: Entry;
    readonly authorId: number;
  }>("entry:autosaveDiscarded"),
  /** A meta write landed: the decoded upserts and the cleared keys. */
  metaChanged: defineEvent<{
    readonly entry: { readonly id: number; readonly type: string };
    readonly changes: MetaChanges;
  }>("entry:metaChanged"),
  /**
   * The row about to be written. A throw refuses the save with that error.
   * Scoped handlers run before unscoped ones of their order.
   */
  beforeSave: defineFilter<NewEntry>("entry:beforeSave", { sync: false }),
};

/** What `entry.for(type)` and `registerEntryType` return. */
export type EntryTypeHandle = typeof declarations;

/** Core's events and filters about entries, before its RPC filters join. */
export const entry = {
  ...declarations,
  /**
   * The same events and filter, run only for entries of `type`. A type no
   * plugin registers fails boot.
   */
  for: (type: string): EntryTypeHandle => scopeDeclarations(declarations, type),
};

/** Every declaration `entry` holds, for the boot checks. */
export const entryDeclarations = Object.values(declarations);
