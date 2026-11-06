import { ReferenceFieldBuilder } from "./reference.js";

/**
 * Public scope shape for the `user()` reference field. Carried on
 * the field's `referenceTarget.scope`; the user `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface UserFieldScope {
  /**
   * Restrict matches to these roles, default or declared in config.
   * Empty/absent → any role. Set via `.roles()`.
   */
  readonly roles?: readonly string[];
  /**
   * Whether to surface disabled accounts. Default `false` — disabled
   * users are usually invalid reference targets even though the row
   * still exists. Set via `.includeDisabled()`.
   */
  readonly includeDisabled?: boolean;
}

/**
 * Stores the bare user id as a string. Reads hydrate to the user summary unless
 * `.returns("id")`; single reads stay optional because a target can orphan.
 */
export function user<K extends string>(
  key: K,
): ReferenceFieldBuilder<"user", K> {
  return new ReferenceFieldBuilder("user", key, {});
}
