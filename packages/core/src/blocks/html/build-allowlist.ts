import type { BlockRegistry } from "../block-registry.js";
import type { HtmlAllowlist } from "./sanitize.js";
import { enforceHtmlFloors } from "./floors.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

/**
 * Tag and attribute fields add to the baseline; `schemes` and
 * `allowProtocolRelative` replace it. Not derived from `parsePaste`, so a
 * plugin can't silently widen the raw-HTML allowlist.
 */
export interface HtmlAllowlistOverride {
  readonly extraTags?: readonly string[];
  readonly extraAttributes?: Readonly<Record<string, readonly string[]>>;
  readonly schemes?: readonly string[];
  readonly allowProtocolRelative?: boolean;
}

/**
 * Pure, so safe to cache on the app instance. The registry is unused, reserved
 * for schema-derived per-block attribute allowances.
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
