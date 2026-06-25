import sanitize from "sanitize-html";

import { HEADING_TAGS } from "../headings.js";

/**
 * Shape consumed by `sanitizeHtml`. Operators extend / replace it
 * via `defineApp({ blocks: { htmlAllowlist: {...} } })`; the schema-
 * derived builder produces the same shape from the registry.
 */
export interface HtmlAllowlist {
  readonly allowedTags: readonly string[];
  readonly allowedAttributes: Readonly<Record<string, readonly string[]>>;
  readonly allowedSchemes?: readonly string[];
  readonly allowProtocolRelative?: boolean;
}

/**
 * Baseline allowlist — the set every plumix deploy gets when the
 * operator doesn't override and the schema-derived builder isn't
 * wired through. `sanitize-html` ships on workers (pure-JS
 * htmlparser2) so this runs in both admin and SSR.
 *
 * Anchors deliberately omit `target` / `rel` (reverse-tabnabbing
 * surface). Span has no `data-*` wildcard (framework-binding
 * injection surface). `data:` and `javascript:` schemes blocked.
 */
export const BASELINE_HTML_ALLOWLIST: HtmlAllowlist = Object.freeze({
  allowedTags: [
    "p",
    ...HEADING_TAGS,
    "blockquote",
    "pre",
    "code",
    "hr",
    "br",
    "ul",
    "ol",
    "li",
    "figure",
    "figcaption",
    "strong",
    "em",
    "s",
    "u",
    "mark",
    "sub",
    "sup",
    "kbd",
    "small",
    "cite",
    "abbr",
    "a",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    abbr: ["title"],
    code: ["data-language"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
});

/**
 * Sanitize an HTML string against an allowlist. `raw` non-string
 * input returns `""`; empty string passes through unchanged. The
 * allowlist defaults to the baseline so callers that haven't wired
 * the registry-derived builder still get a safe-by-default render.
 */
export function sanitizeHtml(
  raw: unknown,
  allowlist: HtmlAllowlist = BASELINE_HTML_ALLOWLIST,
): string {
  if (typeof raw !== "string" || raw === "") return "";
  return sanitize(raw, {
    allowedTags: [...allowlist.allowedTags],
    allowedAttributes: Object.fromEntries(
      Object.entries(allowlist.allowedAttributes).map(([tag, attrs]) => [
        tag,
        [...attrs],
      ]),
    ),
    allowedSchemes: allowlist.allowedSchemes
      ? [...allowlist.allowedSchemes]
      : ["http", "https", "mailto", "tel"],
    allowProtocolRelative: allowlist.allowProtocolRelative ?? false,
  });
}
