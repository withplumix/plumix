import type { ReactElement } from "react";
import { Trans, useLingui } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";
import { resolveLabel } from "@plumix/core/i18n";

import type { InserterPattern } from "./block-catalog.js";
import { expandPattern } from "./block-catalog.js";
import { useEditorConfig } from "./editor-config-context.js";
import { useEditorStore } from "./provider.js";

interface StarterModalProps {
  readonly candidates: readonly InserterPattern[];
}

/** Expects patterns already filtered by `selectStarterPatterns`. */
export function StarterModal({
  candidates,
}: StarterModalProps): ReactElement | null {
  const { i18n } = useLingui();
  const { registry } = useEditorConfig();
  const open = useEditorStore((s) => s.starterOpen);
  const setStarterOpen = useEditorStore((s) => s.setStarterOpen);
  const insertBlocks = useEditorStore((s) => s.insertBlocks);
  if (candidates.length === 0) return null;

  const dismiss = (): void => setStarterOpen(false);
  const select = (pattern: InserterPattern): void => {
    insertBlocks(expandPattern(pattern, registry), 0);
    setStarterOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        className="max-w-3xl"
        data-testid="plumix-starter-modal"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            <Trans id="starterModal.title" message="Start from a pattern" />
          </DialogTitle>
          <DialogDescription>
            <Trans
              id="starterModal.description"
              message="Pick a starting layout, or begin from a blank canvas."
            />
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((pattern) => (
            <li key={pattern.name}>
              <button
                type="button"
                className="hover:bg-muted/40 focus-visible:ring-ring flex w-full flex-col gap-2 rounded-md border p-2 text-start focus:outline-none focus-visible:ring-2"
                data-testid={`plumix-starter-modal-card-${pattern.name}`}
                onClick={() => select(pattern)}
              >
                <StarterThumbnail pattern={pattern} />
                <span className="text-sm font-medium">
                  {resolveLabel(pattern.title, i18n)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            data-testid="plumix-starter-modal-start-blank"
            onClick={dismiss}
          >
            <Trans id="starterModal.startBlank" message="Start from blank" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A placeholder, not a live render, when the pattern declares no `preview`. */
function StarterThumbnail({
  pattern,
}: {
  readonly pattern: InserterPattern;
}): ReactElement {
  const { preview } = pattern;
  if (preview) {
    return (
      <img
        src={preview.src}
        width={preview.width}
        height={preview.height}
        alt={preview.alt ?? ""}
        className="aspect-video w-full rounded object-cover"
      />
    );
  }
  return <div className="bg-muted/50 aspect-video rounded" aria-hidden />;
}
