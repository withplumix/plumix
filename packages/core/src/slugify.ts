import slugifyLib from "@sindresorhus/slugify";

/**
 * Transliterate a user-authored title or name into a URL-safe slug.
 * Covers European (incl. diacritics), Cyrillic, Greek, Arabic, Turkish,
 * and Vietnamese scripts — `"Новости"` → `"novosti"`, `"café"` →
 * `"cafe"`. CJK and a few other scripts fall back to empty; the form's
 * `slugSchema.minLength(1)` surfaces an inline error so the author
 * types a slug manually instead of hitting a server rejection.
 *
 * Pure ASCII output (not preserved-Unicode) is the WordPress/Ghost
 * default — URLs round-trip cleanly through every client (Slack, email,
 * CLI, grep) rather than dealing with percent-encoding surprises.
 */
export function slugify(input: string): string {
  return slugifyLib(input);
}
