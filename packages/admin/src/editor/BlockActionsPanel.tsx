import type { ReactElement } from "react";
import { useMemo } from "react";

import type { BlockRegistry } from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import { availableTransforms } from "./available-transforms.js";

interface BlockActionsPanelProps {
  readonly specName: string | undefined;
  readonly registry: BlockRegistry;
  readonly onTransform: (option: TransformOption) => void;
  readonly onDuplicate?: () => void;
  readonly onDelete?: () => void;
  readonly onCopyJson?: () => void;
}

export function BlockActionsPanel({
  specName,
  registry,
  onTransform,
  onDuplicate,
  onDelete,
  onCopyJson,
}: BlockActionsPanelProps): ReactElement | null {
  const options = useMemo(
    () => (specName ? availableTransforms(specName, registry) : []),
    [specName, registry],
  );

  if (!specName) {
    return (
      <div
        className="text-muted-foreground p-4 text-xs"
        data-testid="block-actions-empty"
      >
        Select a block to see actions.
      </div>
    );
  }

  const hasExtras = Boolean(onDuplicate ?? onDelete ?? onCopyJson);
  if (options.length === 0 && !hasExtras) return null;

  return (
    <div className="space-y-2 border-b p-4" data-testid="block-actions-panel">
      {options.length > 0 ? (
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">Transform to</div>
          <ul className="flex flex-wrap gap-1" data-testid="block-actions-list">
            {options.map((option) => (
              <li key={option.targetName}>
                <button
                  type="button"
                  onClick={() => onTransform(option)}
                  className="rounded border px-2 py-1 text-xs"
                  data-testid={`block-action-transform-${option.targetName}`}
                >
                  {option.targetTitle}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasExtras ? (
        <div className="flex flex-wrap gap-1">
          {onDuplicate ? (
            <button
              type="button"
              onClick={onDuplicate}
              className="rounded border px-2 py-1 text-xs"
              data-testid="block-action-duplicate"
            >
              Duplicate
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded border px-2 py-1 text-xs"
              data-testid="block-action-delete"
            >
              Delete
            </button>
          ) : null}
          {onCopyJson ? (
            <button
              type="button"
              onClick={onCopyJson}
              className="rounded border px-2 py-1 text-xs"
              data-testid="block-action-copy-json"
            >
              Copy JSON
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
