import type { BlockRegistry } from "../block-registry.js";
import type { HtmlAllowlist } from "./sanitize.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

/**
 * Operator-supplied override applied on top of the baseline. The tag
 * and attribute fields are additive, so operators add capabilities
 * without re-listing everything plumix already permits; `schemes` and
 * `allowProtocolRelative` replace their baseline instead.
 *
 * Intentionally NOT derived from the registry's `parsePaste`
 * selectors — `parsePaste` controls how the editor absorbs INPUT into
 * a block, which is a different trust surface from what `core/html`
 * accepts as OUTPUT. Conflating the two would let a plugin block
 * declaring `parsePaste: [{ selector: "iframe" }]` silently widen
 * every consumer's raw-HTML allowlist.
 */
export interface HtmlAllowlistOverride {
  readonly extraTags?: readonly string[];
  readonly extraAttributes?: Readonly<Record<string, readonly string[]>>;
  readonly schemes?: readonly string[];
  readonly allowProtocolRelative?: boolean;
}

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
 * Build a DOMPurify-compatible allowlist from the intrinsic baseline
 * plus the operator's override. Pure — deterministic, safe to cache
 * on the app instance.
 *
 * The block registry is accepted as a parameter so future versions
 * can opt into schema-derived per-block attribute allowances; today
 * the registry is unused but the signature forward-compats that work.
 */
export function buildHtmlAllowlist(
  _registry: BlockRegistry,
  override?: HtmlAllowlistOverride,
): HtmlAllowlist {
  const isAllowed = (tag: string): boolean => !HARD_DENYLIST.has(tag);

  // Override tags are lowercased first: DOMPurify lowercases its own
  // allowlist, so `"IFRAME"` would otherwise slip past the denylist here
  // and be honoured by the browser sanitizer.
  const tags = [
    ...BASELINE_HTML_ALLOWLIST.allowedTags,
    ...(override?.extraTags ?? []).map((tag) => tag.toLowerCase()),
  ].filter(isAllowed);

  const attrs: Record<string, string[]> = {};
  for (const [rawTag, names] of [
    ...Object.entries(BASELINE_HTML_ALLOWLIST.allowedAttributes),
    ...Object.entries(override?.extraAttributes ?? {}),
  ]) {
    const tag = rawTag.toLowerCase();
    if (!LITERAL_NAME.test(tag) || !isAllowed(tag)) continue;
    const allowed = names
      .map((name) => name.toLowerCase())
      .filter(isAllowedAttr);
    attrs[tag] = Array.from(new Set([...(attrs[tag] ?? []), ...allowed]));
  }

  // `??` only triggers on null / undefined, so an explicit `schemes: []`
  // (lock-down) survives. Lowercased because the two engines disagree on
  // a mixed-case entry: sanitize-html compares the list verbatim, the
  // DOMPurify shim lowercases it.
  const schemes = Array.from(
    new Set(
      (override?.schemes ?? BASELINE_HTML_ALLOWLIST.allowedSchemes ?? [])
        .map((scheme) => scheme.toLowerCase())
        .filter((scheme) => !HARD_DENIED_SCHEMES.has(scheme)),
    ),
  );

  return {
    allowedTags: Array.from(new Set(tags)),
    allowedAttributes: attrs,
    allowedSchemes: schemes,
    allowProtocolRelative:
      override?.allowProtocolRelative ??
      BASELINE_HTML_ALLOWLIST.allowProtocolRelative,
  };
}
