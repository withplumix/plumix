import type { UserRole } from "../../db/schema/users.js";
import { ReferenceFieldBuilder } from "./reference.js";

/**
 * Public scope shape for the `user()` reference field. Carried on
 * the field's `referenceTarget.scope`; the user `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface UserFieldScope {
  /** Restrict matches to these roles. Empty/absent → any role. Set via `.roles()`. */
  readonly roles?: readonly UserRole[];
  /**
   * Whether to surface disabled accounts. Default `false` — disabled
   * users are usually invalid reference targets even though the row
   * still exists. Set via `.includeDisabled()`.
   */
  readonly includeDisabled?: boolean;
}

/**
 * Build a typed `user` reference field — `user("owner")`. Scope is
 * optional and chained (`.roles([...])`, `.includeDisabled()`);
 * `.multiple()` flips to an id array.
 *
 * Storage is the bare user id as a string (an id array under
 * `.multiple()`). Reads hydrate to the user summary by default
 * (`.returns("id")` opts back to the bare id); single reads stay
 * optional (a target can orphan). The admin renders a picker that
 * calls the lookup RPC with `{ kind: "user", scope }`.
 */
export function user<K extends string>(
  key: K,
): ReferenceFieldBuilder<"user", K> {
  return new ReferenceFieldBuilder("user", key, {});
}
