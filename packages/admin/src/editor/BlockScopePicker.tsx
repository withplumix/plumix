import type { ReactElement } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";

import type {
  BlockRegistry,
  BlockVariation,
  PatternRegistry,
} from "@plumix/blocks";

import { LazyMount } from "./LazyMount.js";
import { THUMBNAIL_MIN_HEIGHT } from "./thumbnail-min-height.js";
import { VariationThumbnail } from "./VariationThumbnail.js";

interface BlockScopePickerProps {
  readonly blockTitle: string;
  readonly parentBlockName: string;
  readonly variations: readonly BlockVariation[];
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
  readonly onSelect: (variation: BlockVariation) => void;
  readonly onDismiss: () => void;
}

// Block-scope picker — opens after inserting a parent block whose
// variations include any `scope: ["block"]`. The author picks a layout;
// cancel inserts the bare block with its declared defaults.
export function BlockScopePicker({
  blockTitle,
  parentBlockName,
  variations,
  blocks,
  patterns,
  onSelect,
  onDismiss,
}: BlockScopePickerProps): ReactElement | null {
  if (variations.length === 0) return null;
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        className="max-w-3xl"
        data-testid="plumix-block-scope-picker"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Choose a {blockTitle} layout</DialogTitle>
          <DialogDescription>
            Pick a layout to insert, or cancel to start from a blank{" "}
            {blockTitle}.
          </DialogDescription>
        </DialogHeader>
        {/* Raw `variation.slug` is safe here — the picker scopes to one
           parent block at a time and a BlockSpec can't declare two
           variations with the same slug. */}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {variations.map((variation) => (
            <li key={variation.slug}>
              <div
                role="button"
                tabIndex={0}
                className="hover:bg-muted/40 flex w-full flex-col gap-2 rounded border p-3 text-left focus:outline-none focus-visible:ring"
                data-testid={`plumix-block-scope-picker-card-${variation.slug}`}
                onClick={() => onSelect(variation)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(variation);
                  }
                }}
              >
                <LazyMount
                  placeholderTestId={`plumix-block-scope-picker-thumbnail-placeholder-${parentBlockName}:${variation.slug}`}
                  minHeight={THUMBNAIL_MIN_HEIGHT}
                >
                  <div className="overflow-hidden rounded">
                    <VariationThumbnail
                      parentBlockName={parentBlockName}
                      variation={variation}
                      blocks={blocks}
                      patterns={patterns}
                    />
                  </div>
                </LazyMount>
                <span className="text-sm font-medium">{variation.title}</span>
                {variation.description ? (
                  <span className="text-muted-foreground text-xs">
                    {variation.description}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            data-testid="plumix-block-scope-picker-cancel"
            onClick={onDismiss}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
