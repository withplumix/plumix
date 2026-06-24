// Allowlist for author-supplied HTML attributes spread onto a block's root
// element. Attributes reach the DOM as React props, so the threat isn't the
// value (React escapes it) but the KEY: a `dangerouslySetInnerHTML` injects
// markup, and a lowercase `onclick`/`onerror` is rendered as a live handler.
// An allowlist makes both impossible — only inert, presentational/metadata
// attributes pass. Enforced at render (the security boundary), like CSS
// sanitization at emit time; the editor only mirrors it for UX.

// Safe global attributes that work as-is when spread as lowercase React props.
// (`tabindex`/`contenteditable` etc. are intentionally omitted — they need
// React's camelCase prop names, and aren't worth the casing dance here.)
const ALLOWED_GLOBAL = new Set(["id", "title", "role", "lang", "dir"]);

// A well-formed attribute name. Rejecting anything else means a key can't smuggle
// a second attribute (`data-x onmouseover=…`) or markup (`data-x"><script>`) —
// so the allowlist stands on its own, not only because React drops bad names.
const ATTR_NAME = /^[a-z][a-z0-9-]*$/;

/** Whether an author may set this attribute on a block. Allows the safe global
 *  set plus `aria-*` and `data-*` wildcards, minus the framework's reserved
 *  `data-plumix-*` seam. Everything else (event handlers, `style`, `class`,
 *  `dangerouslySetInnerHTML`, malformed names, …) is rejected. */
export function isAllowedHtmlAttr(name: string): boolean {
  const n = name.toLowerCase();
  if (!ATTR_NAME.test(n)) return false;
  if (n.startsWith("data-plumix-")) return false;
  if (n.startsWith("aria-") || n.startsWith("data-")) return true;
  return ALLOWED_GLOBAL.has(n);
}

/** Filter an author-supplied attribute map down to the allowlisted, string-
 *  valued entries safe to spread onto a block element. */
export function safeHtmlAttrs(
  attrs: Readonly<Record<string, unknown>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attrs) return out;
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string" && isAllowedHtmlAttr(key)) out[key] = value;
  }
  return out;
}
