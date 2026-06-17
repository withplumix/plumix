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
  /**
   * Rows nested inside a Puck `Drawer.Item` wrapper must not be
   * interactive themselves (axe `nested-interactive`) — dnd-kit's
   * keyboard sensor makes the wrapper a focusable role=button whose
   * action is keyboard DRAG, not insert. The plain row carries the
   * pointer click; keyboard insertion lives in the slash menu.
   */
  readonly interactive?: boolean;
}

export function InsertableEntryRow({
  entry,
  blocks,
  patterns,
  onClick,
  interactive = true,
}: InsertableEntryRowProps): ReactElement {
  const renderLabel = useLabel();
  if (!isVariation(entry)) {
    // Square tile (Builder.io-style): centered icon above a centered label,
    // sized to fill a 2-column grid cell so the block list matches the
    // pattern/variation card posture instead of a horizontal pill.
    const className =
      "hover:bg-muted hover:border-foreground/20 flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border p-2 text-center text-xs leading-tight focus:outline-none focus-visible:ring";
    const testId = `plumix-blocks-tab-item-${entryKey(entry)}`;
    const content = (
      <>
        <BlockIcon
          name={entry.icon}
          className="text-muted-foreground h-5 w-5 shrink-0"
        />
        <span className="line-clamp-2">{renderLabel(entry.title)}</span>
      </>
    );
    if (!interactive) {
      return (
        <div className={className} data-testid={testId} onClick={onClick}>
          {content}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={className}
        data-testid={testId}
        onClick={onClick}
      >
        {content}
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
      className="hover:bg-muted flex w-full flex-col gap-2 rounded border p-2 text-start text-sm focus:outline-none focus-visible:ring"
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
