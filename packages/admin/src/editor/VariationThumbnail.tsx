import type { ReactElement } from "react";

import type {
  BlockNode,
  BlockRegistry,
  BlockVariation,
  PatternRegistry,
} from "@plumix/blocks";
import { renderBlockTree, resolveVariationPreview } from "@plumix/blocks";

interface VariationThumbnailProps {
  readonly parentBlockName: string;
  readonly variation: BlockVariation;
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
}

// Live thumbnail for the block-scope picker. Wraps the variation's
// preview body in a single parent-block node so the walker renders it
// through the same path as patterns + page content. `example.attrs` /
// `example.innerBlocks` take precedence when supplied (the slice #651
// preview-override contract).
export function VariationThumbnail({
  parentBlockName,
  variation,
  blocks,
  patterns,
}: VariationThumbnailProps): ReactElement {
  const preview = resolveVariationPreview(variation);
  const node: BlockNode = {
    id: `${parentBlockName}-${variation.slug}`,
    name: parentBlockName,
    attrs: { ...preview.attrs, content: preview.innerBlocks },
  };
  return (
    <div
      className="pointer-events-none"
      data-testid={`plumix-variation-thumbnail-${parentBlockName}:${variation.slug}`}
    >
      {renderBlockTree([node], blocks, { patterns })}
    </div>
  );
}
