import type { UserRole } from "../../db/schema/users.js";
import type { MetaBoxFieldSpan, UserListMetaBoxField } from "../manifest.js";
import type { UserFieldScope } from "./user.js";

export interface UserListFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly string[];
  readonly span?: MetaBoxFieldSpan;
  readonly roles?: readonly UserRole[];
  readonly includeDisabled?: boolean;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Build a typed `userList` reference field — the multi-value
 * counterpart to `user()`. Storage is a JSON array of bare user
 * ids (`["42", "43"]`); reads filter out orphans (the array stays
 * dense — missing IDs are dropped, not nulled). The admin renders
 * a `MultiReferencePicker` with drag-to-reorder; the picker stays
 * open until the author closes it or hits `max`.
 *
 * Reuses `UserFieldScope` so the same `roles` / `includeDisabled`
 * filters carry through to the user adapter.
 */
export function userList(options: UserListFieldOptions): UserListMetaBoxField {
  const scope: UserFieldScope = {
    roles: options.roles,
    includeDisabled: options.includeDisabled,
  };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "userList",
    referenceTarget: { kind: "user", scope, multiple: true },
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
