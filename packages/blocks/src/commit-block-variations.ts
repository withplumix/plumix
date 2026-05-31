import type { BlockRegistry } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";
import { BlockVariationError } from "./variation-errors.js";

export function commitBlockVariations(blocks: BlockRegistry): void {
  for (const spec of blocks) {
    if (!spec.variations) continue;
    const declared = spec.inputs
      ? new Set(spec.inputs.map((input) => input.name))
      : undefined;
    const hasContentSlot = spec.inputs?.some(
      (input) => input.name === "content" && input.type === "slot",
    );
    for (const variation of spec.variations) {
      if (variation.scope) {
        for (const value of variation.scope) {
          // Cast through `string` so the union-narrow doesn't tell
          // eslint "this is dead code" — the gate exists for plugins
          // (untyped JS) and dynamic-shape payloads that fall through
          // the compile-time union.
          const v = value as string;
          if (v !== "inserter" && v !== "block" && v !== "transform") {
            throw BlockVariationError.invalidScope(
              spec.name,
              variation.slug,
              v,
            );
          }
        }
      }
      if (variation.scope?.includes("transform") && !variation.attrs) {
        throw BlockVariationError.transformScopeMissingAttrs(
          spec.name,
          variation.slug,
        );
      }
      checkAttrKeys(
        spec.name,
        variation.slug,
        "variation.attrs",
        variation.attrs,
        declared,
      );
      checkAttrKeys(
        spec.name,
        variation.slug,
        "example.attrs",
        variation.example?.attrs,
        declared,
      );
      const guardWalk = (nodes: readonly BlockNode[], path: string): void => {
        if (!hasContentSlot) {
          throw BlockVariationError.missingContentSlot(
            spec.name,
            variation.slug,
          );
        }
        walk(spec.name, variation.slug, nodes, path, blocks);
      };
      if (variation.innerBlocks && variation.innerBlocks.length > 0) {
        guardWalk(variation.innerBlocks, "innerBlocks");
      }
      if (variation.example?.innerBlocks) {
        guardWalk(variation.example.innerBlocks, "example.innerBlocks");
      }
    }
  }
}

function checkAttrKeys(
  parentBlock: string,
  variationSlug: string,
  path: string,
  attrs: Readonly<Record<string, unknown>> | undefined,
  declared: ReadonlySet<string> | undefined,
): void {
  if (!attrs || !declared) return;
  for (const key of Object.keys(attrs)) {
    if (!declared.has(key)) {
      throw BlockVariationError.undeclaredAttr(
        parentBlock,
        variationSlug,
        path,
        parentBlock,
        key,
      );
    }
  }
}

function walk(
  parentBlock: string,
  variationSlug: string,
  nodes: readonly BlockNode[],
  basePath: string,
  blocks: BlockRegistry,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    const spec = blocks.get(node.name);
    if (!spec) {
      throw BlockVariationError.unknownBlock(
        parentBlock,
        variationSlug,
        path,
        node.name,
      );
    }
    const declared = spec.inputs
      ? new Set(spec.inputs.map((input) => input.name))
      : undefined;
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      if (declared && !declared.has(key)) {
        throw BlockVariationError.undeclaredAttr(
          parentBlock,
          variationSlug,
          path,
          node.name,
          key,
        );
      }
      if (isBlockNodeArray(value)) {
        walk(parentBlock, variationSlug, value, `${path}.${key}`, blocks);
      }
    }
  });
}
