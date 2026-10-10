import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError } from "@plumix/core/admin";

// `insert_failed` / `update_failed` carry nothing the caller's fallback doesn't
// say.

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
