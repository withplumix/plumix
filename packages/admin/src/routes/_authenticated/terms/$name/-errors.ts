import type { MessageDescriptor } from "@lingui/core";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";

// Shared CONFLICT → friendly-copy translation for `term.*` mutations.
// Lives here (not in `new.tsx` or `$id.tsx`) so neither route needs to
// import from the other — the direction "$id depends on new" was a
// smell, and the `-` prefix keeps TanStack Router from treating this
// as a route file.
//
// Server surfaces these reasons: `slug_taken`, `parent_mismatch`,
// `parent_is_self`, `parent_cycle`, `insert_failed`, `update_failed`.
// Unknown reasons fall through to the error's own message, then the
// caller-provided `fallback` copy.

const MESSAGES = {
  slug_taken: defineMessage({
    id: "terms.error.slugTaken",
    message: "A term with that slug already exists in this taxonomy.",
  }),
  parent_mismatch: defineMessage({
    id: "terms.error.parentMismatch",
    message: "The selected parent belongs to a different taxonomy.",
  }),
  parent_self_or_cycle: defineMessage({
    id: "terms.error.parentSelfOrCycle",
    message: "A term can't be its own ancestor — pick a different parent.",
  }),
} satisfies Record<string, MessageDescriptor>;

/** Hook returning a mapper that translates `term.*` mutation errors
 *  to localized copy. Mirrors the legacy `mapTermError(err, fallback)`
 *  call shape so the existing `setServerError(mapTerm(...))` flow at
 *  the consumer stays unchanged. */
export function useTermErrorMessage(): (
  err: unknown,
  fallback: string,
) => string {
  const renderLabel = useLabel();
  return (err, fallback) => {
    const reason = extractReason(err);
    if (reason === "slug_taken") return renderLabel(MESSAGES.slug_taken);
    if (reason === "parent_mismatch")
      return renderLabel(MESSAGES.parent_mismatch);
    if (reason === "parent_is_self" || reason === "parent_cycle")
      return renderLabel(MESSAGES.parent_self_or_cycle);
    if (err instanceof Error) return err.message;
    return fallback;
  };
}

function extractReason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    return data?.reason;
  }
  return undefined;
}
