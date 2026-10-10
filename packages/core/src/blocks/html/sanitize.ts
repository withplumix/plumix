import sanitize from "sanitize-html";

import { HEADING_TAGS } from "../headings.js";
import { enforceHtmlFloors } from "./floors.js";

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
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
});

/**
 * Non-string input returns `""`. The floors apply to any allowlist passed,
 * hand-built or not.
 */
export function sanitizeHtml(
  raw: unknown,
  allowlist: HtmlAllowlist = BASELINE_HTML_ALLOWLIST,
): string {
  if (typeof raw !== "string" || raw === "") return "";
  const floored = enforceHtmlFloors(allowlist);
  return sanitize(raw, {
    allowedTags: [...floored.allowedTags],
    allowedAttributes: Object.fromEntries(
      Object.entries(floored.allowedAttributes).map(([tag, attrs]) => [
        tag,
        [...attrs],
      ]),
    ),
    // The floors never inspect this fallback, so it must stay free of
    // `HARD_DENIED_SCHEMES` and match the baseline and the shim's default.
    allowedSchemes: floored.allowedSchemes
      ? [...floored.allowedSchemes]
      : ["http", "https", "mailto", "tel"],
    allowProtocolRelative: floored.allowProtocolRelative ?? false,
  });
}
