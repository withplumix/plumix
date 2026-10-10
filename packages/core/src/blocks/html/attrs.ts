import type { JsonObject } from "../../json.js";

// React escapes values, so the threat is the KEY: `dangerouslySetInnerHTML`
// injects markup and lowercase `onclick` renders a live handler. Render is the
// boundary; the editor only mirrors it.

/**
 * Safe global attributes that work as-is when spread as lowercase React props.
 * (`tabindex`/`contenteditable` etc. are intentionally omitted — they need
 * React's camelCase prop names, and aren't worth the casing dance here.)
 */
const ALLOWED_GLOBAL = new Set(["id", "title", "role", "lang", "dir"]);

/**
 * Stops a key smuggling a second attribute or markup without relying on React
 * dropping bad names.
 */
const ATTR_NAME = /^[a-z][a-z0-9-]*$/;

/** Allows a safe global set plus `aria-*` and `data-*`, minus the reserved
 *  `data-plumix-*`. Event handlers, `style` and `class` are rejected. */
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
  attrs: JsonObject | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attrs) return out;
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string" && isAllowedHtmlAttr(key)) out[key] = value;
  }
  return out;
}
