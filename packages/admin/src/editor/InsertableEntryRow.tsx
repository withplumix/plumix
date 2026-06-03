import type { ReactElement } from "react";
import { useLabel } from "@/lib/use-label.js";

import type {
  BlockRegistry,
  InsertableBlockEntry,
  PatternRegistry,
} from "@plumix/blocks";

import { BlockIcon } from "./BlockIcon.js";
import { entryKey, isVariation } from "./is-variation.js";
import { LazyMount } from "./LazyMount.js";
import { THUMBNAIL_MIN_HEIGHT } from "./thumbnail-min-height.js";
import { VariationThumbnail } from "./VariationThumbnail.js";

interface InsertableEntryRowProps {
  readonly entry: InsertableBlockEntry;
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
  readonly onClick: () => void;
}

export function InsertableEntryRow({
  entry,
  blocks,
  patterns,
  onClick,
}: InsertableEntryRowProps): ReactElement {
  const renderLabel = useLabel();
  if (!isVariation(entry)) {
    return (
      <button
        type="button"
        className="hover:bg-muted flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm"
        data-testid={`plumix-blocks-tab-item-${entryKey(entry)}`}
        onClick={onClick}
      >
        <BlockIcon name={entry.icon} />
        <span className="truncate">{renderLabel(entry.title)}</span>
      </button>
    );
  }
  // `<div role="button">` rather than `<button>` — the live thumbnail can
  // contain interactive HTML (a variation that embeds `core/button`), and
  // the spec forbids interactive descendants inside `<button>`. Mirrors
  // BlockScopePicker's card posture.
  return (
    <div
      role="button"
      tabIndex={0}
      className="hover:bg-muted flex w-full flex-col gap-2 rounded border p-2 text-left text-sm focus:outline-none focus-visible:ring"
      data-testid={`plumix-blocks-tab-item-${entryKey(entry)}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <LazyMount
        placeholderTestId={`plumix-blocks-tab-thumbnail-placeholder-${entry.name}:${entry.slug}`}
        minHeight={THUMBNAIL_MIN_HEIGHT}
      >
        <div
          aria-hidden
          className="pointer-events-none overflow-hidden rounded"
        >
          <VariationThumbnail
            parentBlockName={entry.name}
            variation={entry}
            blocks={blocks}
            patterns={patterns}
          />
        </div>
      </LazyMount>
      <span className="flex items-center gap-2 truncate">
        <BlockIcon name={entry.icon} />
        <span className="truncate">{renderLabel(entry.title)}</span>
      </span>
    </div>
  );
}
