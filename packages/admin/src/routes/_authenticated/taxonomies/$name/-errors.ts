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

export function mapTermError(err: unknown, fallback: string): string {
  const reason = extractReason(err);
  if (reason === "slug_taken") {
    return "A term with that slug already exists in this taxonomy.";
  }
  if (reason === "parent_mismatch") {
    return "The selected parent belongs to a different taxonomy.";
  }
  if (reason === "parent_is_self" || reason === "parent_cycle") {
    return "A term can't be its own ancestor — pick a different parent.";
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function extractReason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    return data?.reason;
  }
  return undefined;
}
