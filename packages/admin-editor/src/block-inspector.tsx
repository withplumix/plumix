import type { ReactElement } from "react";
import { useCallback, useMemo } from "react";
import { Trans } from "@lingui/react";

import type { JsonValue } from "@plumix/core/blocks";
import type { SerializedLoaderData } from "@plumix/core/blocks/renderer";
import { Button } from "@plumix/admin-ui/button";
import { Minus, Plus, RefreshCw } from "@plumix/admin-ui/icons";

import { createNodeFromEntry } from "./block-catalog.js";
import { BlockInputControl } from "./block-input-control.js";
import { useEditorConfig, useLayoutGate } from "./editor-config-context.js";
import { inspectorView } from "./inspector-view.js";
import { useEditorStore, useLoaderPushRef } from "./provider.js";
import { deviceBucket } from "./store.js";
import { UnregisteredBlockNotice } from "./unregistered-block-notice.js";

interface BlockInspectorProps {
  /** When set, a loader-backed block gets a "Refresh data" control. */
  readonly onRefreshBlockLoader?: (
    blockId: string,
  ) => Promise<SerializedLoaderData>;
}

export function BlockInspector({
  onRefreshBlockLoader,
}: BlockInspectorProps): ReactElement {
  const { registry, allowedBlocks, resolvePluginFieldType } = useEditorConfig();
  const layout = useLayoutGate();
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
  const canRefresh = Boolean(onRefreshBlockLoader);
  const view = useMemo(
    () =>
      inspectorView(
        registry,
        tree,
        activeId,
        bucket,
        canRefresh,
        allowedBlocks,
        layout,
      ),
    [registry, tree, activeId, bucket, canRefresh, allowedBlocks, layout],
  );
  const block = view?.block;
  const tableId = view?.tableId ?? null;
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

  if (!view) {
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

  if (view.unregistered) {
    return (
      <UnregisteredBlockNotice
        name={view.block.name}
        testId="block-inspector-unregistered"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="block-inspector">
      {view.notAllowed ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="block-inspector-not-allowed"
        >
          <Trans
            id="editor.inspector.notAllowed"
            message="This site no longer offers this block. You can edit, move or remove it."
          />
        </p>
      ) : null}
      {view.nothingToSet ? (
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
      {view.inputs.map(({ input, value }) => {
        const styleProp = input.styleProperty;
        return (
          <BlockInputControl
            key={input.name}
            input={input}
            resolvePluginFieldType={resolvePluginFieldType}
            attrs={view.block.attrs}
            value={value}
            onChange={(next) => {
              if (!styleProp) {
                handleChange(input.name, next);
                return;
              }
              if (!activeId) return;
              updateBlockStyle(
                activeId,
                bucket,
                styleProp,
                typeof next === "string" && next !== "" ? next : null,
              );
            }}
          />
        );
      })}
      {view.showAddColumn && (
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
      {view.showRefresh && (
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
