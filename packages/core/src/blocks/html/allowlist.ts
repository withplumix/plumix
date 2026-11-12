import { HEADING_TAGS } from "../headings.js";
import { LINK_SCHEMES } from "../marks/safe-href.js";

// Apart from `sanitize.ts`, so the editor canvas reads the baseline without
// loading the sanitizer, which loads with the views that sanitize.

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
 * Anchors omit `target` / `rel` (reverse tabnabbing) and span has no `data-*`
 * wildcard (framework-binding injection).
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
  allowedSchemes: LINK_SCHEMES,
  allowProtocolRelative: false,
});
