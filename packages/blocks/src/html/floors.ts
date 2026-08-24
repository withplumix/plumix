import type { HtmlAllowlist } from "./sanitize.js";

/**
 * The floors under `HtmlAllowlist`: the tags, attributes and schemes
 * no allowlist may carry into sanitized output, and the pass that
 * strips them.
 *
 * They live here rather than in `build-allowlist.ts` because
 * `buildHtmlAllowlist` is not the only way an allowlist reaches the
 * renderer — `HtmlAllowlistProvider` takes any `HtmlAllowlist`, and
 * both are public. `sanitizeHtml` is the one call every render passes
 * through, builder or not, so the floors are applied there and this
 * module is what the two sides share.
 */

/**
 * Tags that may never appear in sanitized output regardless of what
 * the baseline or operator override declares — a floor under
 * `extraTags` typos and operator-config mistakes.
 *
 * Two families qualify. Elements that are an execution, navigation or
 * subresource surface, which no attribute filtering makes inert. And
 * elements whose children parse as raw text on one pass and as markup
 * on the next: sanitized output is re-parsed, since `core/html` and
 * `core/rich-text` both hand it to `dangerouslySetInnerHTML`, which
 * makes that second family the mutation-XSS shape. The remaining
 * integration points — `foreignObject`, `mtext` and friends — are
 * reachable only inside `svg` / `math`, denied here already.
 *
 * Scoped to tags; the override's other fields have their own floors
 * below.
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
 * Attribute names that may never be allowlisted, whatever
 * `extraAttributes` declares. The half that needs a floor most: `on*`
 * re-opens script execution on any tag that survives `HARD_DENYLIST`,
 * `<p>` included, so it needs no element of its own. Handlers are
 * matched by prefix rather than listed — the set grows with every new
 * event.
 *
 * `style` is denied outright rather than sanitized. Trusting a
 * declaration string means parsing `prop:val;prop:val` identically in
 * both engines; `sanitizeCssValue` validates a single value, and the
 * styles pipeline it guards receives CSS as structured property /
 * value pairs. `attrs.ts` denies the attribute on the same grounds.
 */
export const HARD_DENIED_ATTRS: ReadonlySet<string> = new Set(["style"]);

/**
 * A literal name, no glob and no namespace — the rule `attrs.ts` uses
 * on the author-supplied surface, applied here to both the attribute
 * names an override declares and the tags it hangs them on.
 *
 * Load-bearing, not hygiene. sanitize-html reads an attribute entry as
 * a GLOB and a `"*"` tag key as every tag, so `{ "*": ["*"] }` hands
 * back everything the checks below reject, and `"*click"` walks past a
 * prefix test. The DOMPurify shim matches both exactly and honours
 * neither, so those configs sanitize clean in the editor and dirty on
 * the server. Refusing the shape closes the hole and the divergence
 * together.
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
 * URL schemes that may never be allowlisted, whatever `schemes`
 * declares — the floor under an override that would otherwise be
 * wider than the baseline in the one direction that matters:
 * `javascript:` on an `href` needs no tag the baseline does not
 * already allow.
 *
 * The schemes `renderer/link.tsx` refuses to make clickable. They
 * either execute (`javascript`, `vbscript`) or carry their own
 * document, and with it their own scripts, into the page's origin
 * (`data`, `blob`). `view-source` joins them as the wrapper the other
 * four hide behind: `sanitize-html` reads it as the whole scheme of
 * `view-source:javascript:...` and keeps the href, where DOMPurify
 * rejects it on its own regexp — denying it here is what makes the two
 * engines agree. `link.tsx` peels that wrapper instead of listing it,
 * testing hrefs rather than scheme names.
 */
export const HARD_DENIED_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "vbscript",
  "data",
  "blob",
  "view-source",
]);

/**
 * Narrow an allowlist to the floors, whatever produced it: names are
 * lowercased, deduped, and the denied ones dropped.
 *
 * Normalizing here rather than in the builder is what makes the floors
 * hold for a hand-built allowlist. Both engines lowercase, but not the
 * same side of the comparison — sanitize-html lowercases the parsed
 * name and matches the list verbatim, DOMPurify lowercases its list —
 * so `allowedTags: ["IFRAME"]` renders nothing on the server and a
 * live iframe in the editor unless the list is canonical before either
 * sees it.
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
