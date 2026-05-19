import type { BlockRegistryV2 } from "@plumix/blocks";
import type { ReactElement } from "react";
import { useMemo } from "react";

import type { TransformOption } from "./available-transforms.js";

import { availableTransforms } from "./available-transforms.js";

interface BlockActionsPanelProps {
  readonly specName: string | undefined;
  readonly registry: BlockRegistryV2;
  readonly onTransform: (option: TransformOption) => void;
}

export function BlockActionsPanel({
  specName,
  registry,
  onTransform,
}: BlockActionsPanelProps): ReactElement | null {
  const options = useMemo(
    () => (specName ? availableTransforms(specName, registry) : []),
    [specName, registry],
  );

  if (!specName) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-testid="block-actions-empty"
      >
        Select a block to see actions.
      </div>
    );
  }

  if (options.length === 0) return null;

  return (
    <div className="space-y-1 border-b p-3" data-testid="block-actions-panel">
      <div className="text-xs text-muted-foreground">Transform to</div>
      <ul
        className="flex flex-wrap gap-1"
        data-testid="block-actions-list"
      >
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
  );
}
