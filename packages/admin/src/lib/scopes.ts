/** One capability per line, trimmed, blank lines dropped. */
export function parseScopesText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
