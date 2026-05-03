// Shared between the API-tokens card (self-mint form) and the
// `/auth/device` approval page. Both surfaces collect a capability
// whitelist as a textarea (one cap per line) and translate to the
// wire shape `string[] | null`.

/** One capability per line, trimmed, blank lines dropped. */
export function parseScopesText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
