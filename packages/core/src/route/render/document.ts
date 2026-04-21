/**
 * Minimal default document. No theme, no CSS, no head metadata beyond what
 * a browser needs to render the bytes as HTML — this is the "ugly but
 * working" walking-skeleton layout. Themes replace this entirely.
 */
export function renderDefaultDocument(args: {
  readonly title: string;
  readonly bodyHtml: string;
}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(args.title)}</title></head><body>${args.bodyHtml}</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Attribute-context escape: `href="..."` / `alt="..."` etc. Additionally
// escapes the quote characters that would let untrusted input break out of
// the attribute.
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
