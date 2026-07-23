import type { EntryStatus } from "../../db/schema/entries.js";
import { ReferenceFieldBuilder } from "./reference.js";

/**
 * Public scope shape for the `entry()` reference field. Carried on
 * the field's `referenceTarget.scope`; the entry `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface EntryFieldScope {
  /**
   * Restrict matches to these entry types. Required at the field
   * level — entry references without a type filter would surface
   * the entire content table to pickers. Seeded from the `entry()`
   * constructor argument.
   */
  readonly entryTypes: readonly string[];
  /**
   * Whether to surface trashed entries. Default `false` — trashed
   * entries are usually invalid reference targets. Set via
   * `.includeTrashed()`.
   */
  readonly includeTrashed?: boolean;
  /**
   * Restrict matches to exactly this lifecycle status; supersedes the
   * `includeTrashed` default. Public-render consumers (e.g. menu nav)
   * pass `"published"` via `.status()` so drafts never surface; the
   * admin picker leaves it unset and keeps admitting drafts/scheduled.
   */
  readonly status?: EntryStatus;
}

/**
 * Build a typed `entry` reference field —
 * `entry("related", ["post"])`. The required entry-type scope is the
 * constructor's second argument; `.includeTrashed()` / `.status()`
 * refine it, `.multiple()` flips to an id array.
 *
 * Storage is the bare entry id (an id array under `.multiple()`).
 * Reads hydrate to the entry summary by default (`.returns("id")`
 * opts back to the bare id); single reads stay optional (a target can
 * orphan). The admin renders a picker that calls the lookup RPC with
 * `{ kind: "entry", scope }`.
 */
export function entry<K extends string>(
  key: K,
  entryTypes: readonly string[],
): ReferenceFieldBuilder<"entry", K> {
  return new ReferenceFieldBuilder("entry", key, { entryTypes });
}
