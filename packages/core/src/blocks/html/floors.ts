import type { HtmlAllowlist } from "./sanitize.js";

/**
 * Denied whatever an allowlist declares. Parser context switches are denied
 * because sanitized output is re-parsed by `dangerouslySetInnerHTML`, the
 * mutation-XSS shape.
 */
export const HARD_DENYLIST: ReadonlySet<string> = new Set([
  // execution / navigation / subresource surface
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "style",
  "link",
  "meta",
  "base",
  "frame",
  "frameset",
  "form",
  "input",
  "textarea",
  "button",
  // parser context switches
  "svg",
  "math",
  "annotation-xml",
  "noscript",
  "template",
  "title",
  "xmp",
  "noembed",
  "noframes",
  "plaintext",
]);

/**
 * Denied whatever an allowlist declares; `on*` handlers are also denied by
 * prefix. `style` is denied rather than sanitized because both engines would
 * have to parse declaration strings identically.
 */
export const HARD_DENIED_ATTRS: ReadonlySet<string> = new Set(["style"]);

/**
 * sanitize-html reads names as globs (`{ "*": ["*"] }`, `"*click"`) while the
 * DOMPurify shim matches exactly, so a glob would bypass the floors on the
 * server only.
 */
const LITERAL_NAME = /^[a-z][a-z0-9-]*$/;

function isAllowedAttr(name: string): boolean {
  return (
    LITERAL_NAME.test(name) &&
    !name.startsWith("on") &&
    !HARD_DENIED_ATTRS.has(name)
  );
}

/**
 * Denied whatever an allowlist declares. `view-source` is listed because
 * sanitize-html keeps `view-source:javascript:` hrefs that DOMPurify rejects.
 */
export const HARD_DENIED_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "vbscript",
  "data",
  "blob",
  "view-source",
]);

/**
 * Lowercases names because the engines lowercase opposite sides:
 * `allowedTags: ["IFRAME"]` would otherwise render nothing on the server and a
 * live iframe in the editor.
 */
export function enforceHtmlFloors(allowlist: HtmlAllowlist): HtmlAllowlist {
  const allowedTags = Array.from(
    new Set(allowlist.allowedTags.map((tag) => tag.toLowerCase())),
  ).filter((tag) => LITERAL_NAME.test(tag) && !HARD_DENYLIST.has(tag));

  const allowedAttributes: Record<string, string[]> = {};
  for (const [rawTag, names] of Object.entries(allowlist.allowedAttributes)) {
    const tag = rawTag.toLowerCase();
    if (!LITERAL_NAME.test(tag) || HARD_DENYLIST.has(tag)) continue;
    const allowed = names
      .map((name) => name.toLowerCase())
      .filter(isAllowedAttr);
    allowedAttributes[tag] = Array.from(
      new Set([...(allowedAttributes[tag] ?? []), ...allowed]),
    );
  }

  return {
    ...allowlist,
    allowedTags,
    allowedAttributes,
    allowedSchemes: allowlist.allowedSchemes
      ? Array.from(
          new Set(
            allowlist.allowedSchemes
              .map((scheme) => scheme.toLowerCase())
              .filter((scheme) => !HARD_DENIED_SCHEMES.has(scheme)),
          ),
        )
      : undefined,
  };
}
