import type { ReactElement } from "react";
import { useMemo } from "react";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import type { BlockIdentity } from "./block-identity.js";
import { availableTransforms } from "./available-transforms.js";
import { BlockIcon } from "./BlockIcon.js";

interface BlockActionsPanelProps {
  readonly specName: string | undefined;
  readonly registry: BlockRegistry;
  // Live identity for the selected instance — variation override or
  // parent block. Caller memoizes against the instance's attrs.
  readonly identity?: BlockIdentity;
  readonly onTransform: (option: TransformOption) => void;
  readonly onDuplicate?: () => void;
  readonly onDelete?: () => void;
  readonly onCopyJson?: () => void;
}

export function BlockActionsPanel({
  specName,
  registry,
  identity,
  onTransform,
  onDuplicate,
  onDelete,
  onCopyJson,
}: BlockActionsPanelProps): ReactElement | null {
  const renderLabel = useLabel();
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
        <Trans
          id="blockActions.empty"
          message="Select a block to see actions."
        />
      </div>
    );
  }

  const hasExtras = Boolean(onDuplicate ?? onDelete ?? onCopyJson);
  if (options.length === 0 && !hasExtras && !identity) return null;

  return (
    <div className="space-y-2 border-b p-4" data-testid="block-actions-panel">
      {identity ? (
        <div
          className="flex items-center gap-2"
          data-testid="block-actions-identity"
        >
          <BlockIcon name={identity.icon} />
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-medium"
              data-testid="block-actions-identity-title"
            >
              {renderLabel(identity.title)}
            </div>
            {identity.description ? (
              <div className="text-muted-foreground truncate text-xs">
                {renderLabel(identity.description)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {options.length > 0 ? (
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            <Trans id="blockActions.transformTo" message="Transform to" />
          </div>
          <ul className="flex flex-wrap gap-1" data-testid="block-actions-list">
            {options.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => onTransform(option)}
                  className="rounded border px-2 py-1 text-xs"
                  data-testid={`block-action-transform-${option.key}`}
                >
                  {renderLabel(option.targetTitle)}
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
              <Trans id="blockActions.duplicate" message="Duplicate" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded border px-2 py-1 text-xs"
              data-testid="block-action-delete"
            >
              <Trans id="blockActions.delete" message="Delete" />
            </button>
          ) : null}
          {onCopyJson ? (
            <button
              type="button"
              onClick={onCopyJson}
              className="rounded border px-2 py-1 text-xs"
              data-testid="block-action-copy-json"
            >
              <Trans id="blockActions.copyJson" message="Copy JSON" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
