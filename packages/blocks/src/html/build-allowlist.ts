import type { BlockRegistry } from "../block-registry.js";
import type { HtmlAllowlist } from "./sanitize.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

/**
 * Operator-supplied override applied on top of the baseline. Each
 * field is additive against the baseline so operators add capabilities
 * without re-listing everything plumix already permits.
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
 * Scoped to tags. `extraAttributes` and `schemes` have no equivalent
 * floor.
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
  for (const [tag, fields] of Object.entries(
    BASELINE_HTML_ALLOWLIST.allowedAttributes,
  )) {
    if (isAllowed(tag)) attrs[tag] = [...fields];
  }
  for (const [rawTag, extra] of Object.entries(
    override?.extraAttributes ?? {},
  )) {
    const tag = rawTag.toLowerCase();
    if (!isAllowed(tag)) continue;
    attrs[tag] = [...(attrs[tag] ?? []), ...extra];
  }

  return {
    allowedTags: Array.from(new Set(tags)),
    allowedAttributes: attrs,
    // `schemes: []` is preserved — `??` only triggers on null /
    // undefined, so an explicit empty array (lock-down) survives.
    allowedSchemes: override?.schemes ?? BASELINE_HTML_ALLOWLIST.allowedSchemes,
    allowProtocolRelative:
      override?.allowProtocolRelative ??
      BASELINE_HTML_ALLOWLIST.allowProtocolRelative,
  };
}
