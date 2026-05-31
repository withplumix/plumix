import type { ReactElement } from "react";

import type { BlockRegistry, PatternRegistry } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";
import { renderBlockTree } from "@plumix/blocks";

interface PatternThumbnailProps {
  readonly pattern: PatternManifestEntry;
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
}

export function PatternThumbnail({
  pattern,
  blocks,
  patterns,
}: PatternThumbnailProps): ReactElement {
  const testId = `plumix-pattern-thumbnail-${pattern.name}`;
  const { preview } = pattern;
  if (preview) {
    return (
      <img
        src={preview.src}
        width={preview.width}
        height={preview.height}
        alt={preview.alt ?? ""}
        data-testid={testId}
      />
    );
  }
  // pointer-events-none swallows clicks on interactive descendants so
  // they don't compete with the row's onClick selecting the pattern.
  return (
    <div className="pointer-events-none" data-testid={testId}>
      {renderBlockTree(pattern.content, blocks, { patterns })}
    </div>
  );
}
