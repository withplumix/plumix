import type { ReactElement } from "react";
import { useCallback } from "react";
import { Trans } from "@lingui/react";

import type { JsonValue } from "@plumix/core/blocks";
import type { SerializedLoaderData } from "@plumix/core/blocks/renderer";
import { Button } from "@plumix/admin-ui/button";
import { Minus, Plus, RefreshCw } from "@plumix/admin-ui/icons";

import { createNodeFromEntry } from "./block-catalog.js";
import { BlockInputControl } from "./block-input-control.js";
import { enclosingTableId, findBlock } from "./block-tree-ops.js";
import { useEditorConfig } from "./editor-config-context.js";
import { useEditorStore, useLoaderPushRef } from "./provider.js";
import { deviceBucket } from "./store.js";

interface BlockInspectorProps {
  // When set, a loader-backed block gets a "Refresh data" control.
  readonly onRefreshBlockLoader?: (
    blockId: string,
  ) => Promise<SerializedLoaderData>;
}

export function BlockInspector({
  onRefreshBlockLoader,
}: BlockInspectorProps): ReactElement {
  const { registry, resolvePluginFieldType } = useEditorConfig();
  const activeId = useEditorStore((s) => s.activeId);
  const tree = useEditorStore((s) => s.tree);
  const device = useEditorStore((s) => s.device);
  const updateBlockAttrs = useEditorStore((s) => s.updateBlockAttrs);
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const insertBlockInto = useEditorStore((s) => s.insertBlockInto);
  const addTableColumn = useEditorStore((s) => s.addTableColumn);
  const addTableRow = useEditorStore((s) => s.addTableRow);
  const removeTableColumn = useEditorStore((s) => s.removeTableColumn);
  const removeTableRow = useEditorStore((s) => s.removeTableRow);
  const loaderPushRef = useLoaderPushRef();

  const bucket = deviceBucket(device);
  const block = activeId ? findBlock(tree, activeId, registry) : undefined;
  // The table the selection sits in (the table itself, or the one owning the
  // selected row/cell), so the table controls stay in reach while editing
  // cells.
  const tableId = block ? enclosingTableId(tree, block.id, registry) : null;
  const handleChange = useCallback(
    (key: string, value: JsonValue): void => {
      if (activeId) updateBlockAttrs(activeId, { [key]: value });
    },
    [activeId, updateBlockAttrs],
  );
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!activeId || !onRefreshBlockLoader) return;
    const data = await onRefreshBlockLoader(activeId);
    loaderPushRef?.current?.(data);
  }, [activeId, onRefreshBlockLoader, loaderPushRef]);
  const handleAddColumn = useCallback((): void => {
    if (!block) return;
    const node = createNodeFromEntry(registry, {
      name: "core/column",
      slug: "core/column",
      title: "Column",
    });
    // Append at the end of the row's slot; the store clamps the index.
    insertBlockInto(
      node,
      {
        parentId: block.id,
        slotKey: "columns",
        index: Number.MAX_SAFE_INTEGER,
      },
      ["core/column"],
    );
  }, [block, registry, insertBlockInto]);
  const handleAddTableRow = useCallback((): void => {
    if (tableId) addTableRow(tableId);
  }, [tableId, addTableRow]);
  const handleAddTableColumn = useCallback((): void => {
    if (tableId) addTableColumn(tableId);
  }, [tableId, addTableColumn]);
  const handleRemoveTableRow = useCallback((): void => {
    if (tableId) removeTableRow(tableId);
  }, [tableId, removeTableRow]);
  const handleRemoveTableColumn = useCallback((): void => {
    if (tableId) removeTableColumn(tableId);
  }, [tableId, removeTableColumn]);

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

  // A slot input as a control would overwrite the children with a string.
  const spec = registry.get(block.name);
  const inputs = (spec?.inputs ?? []).filter((input) => input.type !== "slot");
  const canRefresh = Boolean(onRefreshBlockLoader && spec?.loaders);
  const isColumns = block.name === "core/columns";
  // Nothing to render would leave a blank panel, indistinguishable from one
  // that failed to load.
  const nothingToSet =
    inputs.length === 0 && !isColumns && !tableId && !canRefresh;

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="block-inspector">
      {nothingToSet ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="block-inspector-no-settings"
        >
          <Trans
            id="editor.inspector.noSettings"
            message="This block has no settings."
          />
        </p>
      ) : null}
      {inputs.map((input) => {
        // A cleared Custom-CSS declaration can leave "" in the bucket; read it
        // as unset.
        const styleProp = input.styleProperty;
        const stored = styleProp
          ? block.style?.[bucket]?.[styleProp]
          : undefined;
        const styleValue = stored === "" ? undefined : stored;
        return (
          <BlockInputControl
            key={input.name}
            input={input}
            resolvePluginFieldType={resolvePluginFieldType}
            attrs={block.attrs}
            value={styleProp ? styleValue : block.attrs?.[input.name]}
            onChange={(value) => {
              if (!styleProp) {
                handleChange(input.name, value);
                return;
              }
              if (!activeId) return;
              const next =
                typeof value === "string" && value !== "" ? value : null;
              updateBlockStyle(activeId, bucket, styleProp, next);
            }}
          />
        );
      })}
      {isColumns && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="inspector-add-column"
          onClick={handleAddColumn}
        >
          <Plus />
          <Trans id="editor.inspector.addColumn" message="Add column" />
        </Button>
      )}
      {tableId && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="inspector-add-table-row"
            onClick={handleAddTableRow}
          >
            <Plus />
            <Trans id="editor.inspector.addRow" message="Add row" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="inspector-add-table-column"
            onClick={handleAddTableColumn}
          >
            <Plus />
            <Trans id="editor.inspector.addColumn" message="Add column" />
          </Button>
          <Button
            type="button"
            variant="destructive-ghost"
            size="sm"
            data-testid="inspector-remove-table-row"
            onClick={handleRemoveTableRow}
          >
            <Minus />
            <Trans id="editor.inspector.removeRow" message="Remove row" />
          </Button>
          <Button
            type="button"
            variant="destructive-ghost"
            size="sm"
            data-testid="inspector-remove-table-column"
            onClick={handleRemoveTableColumn}
          >
            <Minus />
            <Trans id="editor.inspector.removeColumn" message="Remove column" />
          </Button>
        </div>
      )}
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
