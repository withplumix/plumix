import type { BlockRegistry } from "../block-registry.js";
import type { HtmlAllowlist } from "./sanitize.js";
import { enforceHtmlFloors } from "./floors.js";
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
  // Merge only. `enforceHtmlFloors` owns every denial, and canonicalizes
  // what survives, so an override needs no normalizing on the way in.
  const attrs: Record<string, string[]> = {};
  for (const [tag, names] of [
    ...Object.entries(BASELINE_HTML_ALLOWLIST.allowedAttributes),
    ...Object.entries(override?.extraAttributes ?? {}),
  ]) {
    attrs[tag] = [...(attrs[tag] ?? []), ...names];
  }

  return enforceHtmlFloors({
    allowedTags: [
      ...BASELINE_HTML_ALLOWLIST.allowedTags,
      ...(override?.extraTags ?? []),
    ],
    allowedAttributes: attrs,
    // `??` only triggers on null / undefined, so an explicit
    // `schemes: []` (lock-down) survives.
    allowedSchemes:
      override?.schemes ?? BASELINE_HTML_ALLOWLIST.allowedSchemes ?? [],
    allowProtocolRelative:
      override?.allowProtocolRelative ??
      BASELINE_HTML_ALLOWLIST.allowProtocolRelative,
  });
}
