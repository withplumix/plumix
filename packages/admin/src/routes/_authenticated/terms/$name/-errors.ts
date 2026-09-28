import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError } from "@plumix/core/admin";

// Shared reason → copy table for `term.*` mutations. Lives here (not in
// `create.tsx` or `$id/edit.tsx`) so neither route imports from the other;
// the `-` prefix keeps TanStack Router from treating this as a route file.
//
// Server surfaces these reasons: `slug_taken`, `parent_mismatch`,
// `parent_is_self`, `parent_cycle`, `insert_failed`, `update_failed`.
// The last two carry nothing the caller's fallback doesn't already say.

const parentSelfOrCycle = defineMessage({
  id: "terms.error.parentSelfOrCycle",
  message: "A term can't be its own ancestor — pick a different parent.",
});

const REASONS = {
  slug_taken: defineMessage({
    id: "terms.error.slugTaken",
    message: "A term with that slug already exists in this taxonomy.",
  }),
  parent_mismatch: defineMessage({
    id: "terms.error.parentMismatch",
    message: "The selected parent belongs to a different taxonomy.",
  }),
  parent_is_self: parentSelfOrCycle,
  parent_cycle: parentSelfOrCycle,
} satisfies Record<string, MessageDescriptor>;

export function describeTermError(
  err: unknown,
  fallback: MessageDescriptor,
): MessageDescriptor {
  return describeRpcError(err, REASONS, fallback);
}
