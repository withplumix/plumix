import type { ReactElement } from "react";
import { useCallback } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";
import { Button } from "@plumix/admin-ui/button";
import { RefreshCw } from "@plumix/admin-ui/icons";

import { BlockInputControl } from "./block-input-control.js";
import { findBlock } from "./block-tree-ops.js";
import { useEditorStore, useLoaderPushRef } from "./provider.js";

interface BlockInspectorProps {
  /** Core + plugin block registry; supplies each block's input schema. */
  readonly registry: BlockRegistry;
  /** Re-run the active block's loader(s) server-side (the host's orpc call).
   *  When set, a loader-backed block gets a "Refresh data" control. */
  readonly onRefreshBlockLoader?: (
    blockId: string,
  ) => Promise<SerializedLoaderData>;
}

/**
 * Right-rail panel for the active block's custom attributes. Reads the
 * selected block from the canonical tree, renders its registered inputs as
 * admin-ui controls, and patches the store on edit — which the canvas bridge
 * pushes to the iframe for a live, reload-free re-render.
 */
export function BlockInspector({
  registry,
  onRefreshBlockLoader,
}: BlockInspectorProps): ReactElement {
  const activeId = useEditorStore((s) => s.activeId);
  const tree = useEditorStore((s) => s.tree);
  const updateBlockAttrs = useEditorStore((s) => s.updateBlockAttrs);
  const loaderPushRef = useLoaderPushRef();

  const block = activeId ? findBlock(tree, activeId) : undefined;
  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      if (activeId) updateBlockAttrs(activeId, { [key]: value });
    },
    [activeId, updateBlockAttrs],
  );
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!activeId || !onRefreshBlockLoader) return;
    const data = await onRefreshBlockLoader(activeId);
    loaderPushRef?.current?.(data);
  }, [activeId, onRefreshBlockLoader, loaderPushRef]);

  if (!block) {
    return (
      <div
        className="text-muted-foreground p-4 text-sm"
        data-testid="block-inspector-empty"
      >
        <Trans
          id="editor.inspector.empty"
          message="Select a block to edit its attributes."
        />
      </div>
    );
  }

  // Slot inputs hold child block arrays, not scalar attributes — editing
  // them as a control would overwrite the children with a string. Nested
  // editing is a separate concern (canvas selection of the child block).
  const spec = registry.get(block.name);
  const inputs = (spec?.inputs ?? []).filter((input) => input.type !== "slot");
  const canRefresh = Boolean(onRefreshBlockLoader && spec?.loaders);

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="block-inspector">
      {inputs.map((input) => (
        <BlockInputControl
          key={input.name}
          input={input}
          value={block.attrs?.[input.name]}
          onChange={(value) => handleChange(input.name, value)}
        />
      ))}
      {canRefresh && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="refresh-block-loader"
          onClick={() => void handleRefresh()}
        >
          <RefreshCw />
          <Trans id="editor.inspector.refreshData" message="Refresh data" />
        </Button>
      )}
    </div>
  );
}
