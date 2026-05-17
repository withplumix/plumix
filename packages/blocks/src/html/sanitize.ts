import sanitize from "sanitize-html";

/**
 * Baseline `core/html` sanitizer. `sanitize-html` is pure-JS
 * (htmlparser2) so it runs on Workers as well as the admin browser.
 * The operator-configurable allowlist lands in #312; this function
 * becomes the default for that config rather than the only option.
 */
export function sanitizeHtml(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "";
  return sanitize(raw, {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "h4",
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
      // `target` / `rel` deliberately omitted — allowing `target="_blank"`
      // without forcing `rel="noopener noreferrer"` opens reverse-tabnabbing
      // on older WebKit and embedded webviews. Authored anchors render
      // same-tab; the operator-configurable allowlist (#312) can add the
      // rel-rewriting transform when target is genuinely needed.
      a: ["href", "title"],
      abbr: ["title"],
      code: ["data-language"],
      // No `data-*` wildcard — a JS framework that treats data-attrs as
      // event bindings (Stimulus, Alpine, htmx hx-on:* aliases) would
      // turn authored HTML into a behavior-injection vector. Add specific
      // attrs explicitly when the editor actually emits them.
    },
    // Override default (which includes `ftp`); drop protocol-relative
    // so `//evil.example` can't smuggle a scheme past the allowlist.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
  });
}
