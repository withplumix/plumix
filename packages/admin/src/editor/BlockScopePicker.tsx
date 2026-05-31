import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";

import type { BlockVariation } from "@plumix/blocks";

interface BlockScopePickerProps {
  readonly blockTitle: string;
  readonly variations: readonly BlockVariation[];
  readonly onSelect: (variation: BlockVariation) => void;
  readonly onDismiss: () => void;
}

// Block-scope picker — opens after inserting a parent block whose
// variations include any `scope: ["block"]`. The author picks a layout;
// cancel inserts the bare block with its declared defaults.
//
// TODO(#637): replace the textual card body with the live thumbnail
// path used by the patterns sidebar (lazy-mount + scaled render).
export function BlockScopePicker({
  blockTitle,
  variations,
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {variations.map((variation) => (
            <li key={variation.slug}>
              <div
                role="button"
                tabIndex={0}
                className="hover:bg-muted/40 flex w-full flex-col gap-1 rounded border p-3 text-left focus:outline-none focus-visible:ring"
                data-testid={`plumix-block-scope-picker-card-${variation.slug}`}
                onClick={() => onSelect(variation)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(variation);
                  }
                }}
              >
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
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
            data-testid="plumix-block-scope-picker-cancel"
            onClick={onDismiss}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
