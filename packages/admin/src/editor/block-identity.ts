import type { BlockSpec } from "@plumix/blocks";
import type { Label } from "@plumix/core/i18n";
import { resolveActiveVariation } from "@plumix/blocks";

export interface BlockIdentity {
  readonly title: Label;
  readonly icon?: string;
  readonly description?: Label;
}

// Variations override the parent block's display identity on instances
// whose `attrs` match the variation's `isActive` matcher. Saved entries
// stay anonymous — identity is re-derived on every render.
export function deriveBlockIdentity(
  spec: BlockSpec,
  attrs: Readonly<Record<string, unknown>>,
): BlockIdentity {
  const variation = resolveActiveVariation(spec, attrs);
  if (variation) {
    return {
      title: variation.title,
      icon: variation.icon ?? spec.icon,
      description: variation.description ?? spec.description,
    };
  }
  return {
    title: spec.title ?? spec.name,
    icon: spec.icon,
    description: spec.description,
  };
}
