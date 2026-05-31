// Best-effort kebab — the emitted snippet is a starting point the
// author edits, so the namespace ("starter/") and fallback slug
// ("untitled") are placeholders, not invariants.
export function derivePatternSlug(title: string): string {
  const suffix = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `starter/${suffix || "untitled"}`;
}
