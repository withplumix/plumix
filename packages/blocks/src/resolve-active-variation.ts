import type { BlockSpec, BlockVariation } from "./block-registry.js";

function readAttr(
  attrs: Readonly<Record<string, unknown>>,
  key: string,
): unknown {
  return attrs[key];
}

export function resolveActiveVariation(
  spec: BlockSpec,
  blockAttrs: Readonly<Record<string, unknown>>,
): BlockVariation | undefined {
  if (!spec.variations) return undefined;
  let bestArrayMatch: { variation: BlockVariation; length: number } | undefined;
  for (const variation of spec.variations) {
    const matcher = variation.isActive;
    if (!matcher) continue;
    if (typeof matcher !== "function") {
      const keys: readonly string[] = matcher;
      const matchAttrs = variation.attrs ?? {};
      const allMatch = keys.every(
        (key) => readAttr(blockAttrs, key) === readAttr(matchAttrs, key),
      );
      if (!allMatch) continue;
      const length = keys.length;
      if (!bestArrayMatch || length > bestArrayMatch.length) {
        bestArrayMatch = { variation, length };
      }
      continue;
    }
    try {
      if (matcher(blockAttrs, variation.attrs ?? {})) {
        return variation;
      }
    } catch (error) {
      console.warn(
        `[plumix:resolve-active-variation] ${spec.name}`,
        variation.slug,
        error,
      );
    }
  }
  return bestArrayMatch?.variation;
}
