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
   * Required: without a type filter a picker would surface the entire content
   * table.
   */
  readonly entryTypes: readonly string[];
  /**
   * Whether to surface trashed entries. Default `false` — trashed
   * entries are usually invalid reference targets. Set via
   * `.includeTrashed()`.
   */
  readonly includeTrashed?: boolean;
  /**
   * Supersedes the `includeTrashed` default. Public-render consumers pass
   * `"published"` so drafts never surface.
   */
  readonly status?: EntryStatus;
}

/**
 * Stores the bare entry id. Reads hydrate to the entry summary unless
 * `.returns("id")`; single reads stay optional because a target can orphan.
 */
export function entry<K extends string>(
  key: K,
  entryTypes: readonly string[],
): ReferenceFieldBuilder<"entry", K> {
  return new ReferenceFieldBuilder("entry", key, { entryTypes });
}
