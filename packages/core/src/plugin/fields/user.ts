import type { UserRole } from "../../db/schema/users.js";
import type { MetaBoxFieldSpan, UserMetaBoxField } from "../manifest.js";

/**
 * Public scope shape for the `user()` reference field. Carried on
 * the field's `referenceTarget.scope`; the user `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface UserFieldScope {
  /** Restrict matches to these roles. Empty/absent → any role. */
  readonly roles?: readonly UserRole[];
  /**
   * Whether to surface disabled accounts. Default `false` —
   * disabled users are usually invalid reference targets even
   * though the row still exists.
   */
  readonly includeDisabled?: boolean;
}

export interface UserFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly roles?: readonly UserRole[];
  readonly includeDisabled?: boolean;
}

/**
 * Build a typed `user` reference field. Storage is the bare user id
 * as a string (`"42"` → `users.id = 42`); reads return the resolved
 * user (or `null` when the target is gone or no longer matches
 * scope). The admin renders a picker that calls the lookup RPC with
 * `{ kind: "user", scope: { roles, includeDisabled } }`.
 *
 * Scope rolls the two filters (`roles`, `includeDisabled`) into the
 * builder's flat option shape — internally they're packaged into a
 * `referenceTarget.scope` object the user adapter consumes.
 */
export function user(options: UserFieldOptions): UserMetaBoxField {
  const scope: UserFieldScope = {
    roles: options.roles,
    includeDisabled: options.includeDisabled,
  };
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "user",
    referenceTarget: { kind: "user", scope },
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
