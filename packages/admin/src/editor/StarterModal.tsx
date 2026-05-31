import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";

import type { BlockRegistry, PatternRegistry } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";

import { PatternThumbnail } from "./PatternThumbnail.js";

interface StarterModalProps {
  readonly candidates: readonly PatternManifestEntry[];
  readonly blocks: BlockRegistry;
  readonly patterns: PatternRegistry;
  readonly onSelect: (pattern: PatternManifestEntry) => void;
  readonly onDismiss: () => void;
}

export function StarterModal({
  candidates,
  blocks,
  patterns,
  onSelect,
  onDismiss,
}: StarterModalProps): ReactElement | null {
  if (candidates.length === 0) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        className="max-w-3xl"
        data-testid="plumix-starter-modal"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Start from a pattern</DialogTitle>
          <DialogDescription>
            Pick a starting layout, or begin from a blank canvas.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((entry) => (
            <li key={entry.name}>
              {/* `<div role="button">` rather than `<button>` — the
                  live thumbnail can contain interactive HTML. Same
                  posture as the sidebar row. */}
              <div
                role="button"
                tabIndex={0}
                className="hover:bg-muted/40 flex w-full flex-col gap-2 rounded border p-2 text-left focus:outline-none focus-visible:ring"
                data-testid={`plumix-starter-modal-card-${entry.name}`}
                onClick={() => onSelect(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(entry);
                  }
                }}
              >
                <div className="pointer-events-none overflow-hidden rounded">
                  <PatternThumbnail
                    pattern={entry}
                    blocks={blocks}
                    patterns={patterns}
                  />
                </div>
                <span className="text-sm font-medium">{entry.title}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
            data-testid="plumix-starter-modal-start-blank"
            onClick={onDismiss}
          >
            Start from blank
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
