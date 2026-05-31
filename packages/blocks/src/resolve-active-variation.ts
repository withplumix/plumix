import type { BlockSpec, BlockVariation } from "./block-registry.js";

export function resolveActiveVariation(
  spec: BlockSpec,
  blockAttrs: Readonly<Record<string, unknown>>,
): BlockVariation | undefined {
  if (!spec.variations) return undefined;
  let bestArrayMatch: { variation: BlockVariation; length: number } | undefined;
  for (const variation of spec.variations) {
    const matcher = variation.isActive;
    if (!matcher) continue;
    if (typeof matcher === "function") {
      try {
        if (matcher(blockAttrs, variation.attrs ?? {})) return variation;
      } catch (error) {
        console.warn(
          `[plumix:resolve-active-variation] ${spec.name}`,
          variation.slug,
          error,
        );
      }
      continue;
    }
    const matchAttrs = variation.attrs ?? {};
    // Constraining keys: a key listed in `isActive` only counts when
    // the variation actually declares a value for it. Keys that aren't
    // declared on either side would otherwise inflate specificity via
    // `undefined === undefined`. Structural compare (JSON-serialised)
    // catches nested-object attrs whose references differ across
    // renders — entry content is JSON anyway, so deep equality is the
    // honest baseline.
    const constraining = matcher.filter((key) => key in matchAttrs);
    if (constraining.length === 0) continue;
    const allMatch = constraining.every((key) =>
      structuralEquals(blockAttrs[key], matchAttrs[key]),
    );
    if (!allMatch) continue;
    if (!bestArrayMatch || constraining.length > bestArrayMatch.length) {
      bestArrayMatch = { variation, length: constraining.length };
    }
  }
  return bestArrayMatch?.variation;
}

function structuralEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
