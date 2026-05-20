import type { BlockRegistryV2, ResponsiveStyleSlot, ThemeTokens } from "@plumix/blocks";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { createBlockRegistry } from "@plumix/blocks";
import { Puck, usePuck } from "@puckeditor/core";

import { useIsMobile } from "@/hooks/use-mobile.js";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";

import type { TransformOption } from "./available-transforms.js";
import type { SlashMenuItem } from "./slash-menu-items.js";

import { AutosaveStatusPill } from "./AutosaveStatus.js";
import { BlockActionsPanel } from "./BlockActionsPanel.js";
import { HeadingAuditPanel } from "./HeadingAuditPanel.js";
import { MobileInspectorSheet } from "./MobileInspectorSheet.js";
import { patchStyleAtSelector } from "./patch-style.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";
import { nextInsertPoint, resolveSlashMenuItems } from "./slash-menu-items.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";
import { StyleTab } from "./StyleTab.js";
import { viewportWidthToBucket } from "./viewport-bucket.js";

interface PlumixEditorLayoutProps {
  readonly registry?: BlockRegistryV2;
  readonly capabilities?: ReadonlySet<string>;
  readonly tokens?: ThemeTokens;
  readonly children?: ReactNode;
}

const EMPTY_REGISTRY: BlockRegistryV2 = createBlockRegistry([]);
const EMPTY_CAPS: ReadonlySet<string> = new Set();
const EMPTY_TOKENS: ThemeTokens = {};

function PlumixAuditTab(): ReactElement {
  const puck = usePuck();
  const tree = useMemo(
    () => puckDataToBlockTree(puck.appState.data),
    [puck.appState.data],
  );
  const handleSelect = (nodeId: string): void => {
    const itemSelector = puck.getSelectorForId(nodeId);
    if (!itemSelector) return;
    puck.dispatch({ type: "setUi", ui: { itemSelector } });
  };
  return <HeadingAuditPanel tree={tree} onSelect={handleSelect} />;
}

export function PlumixEditorLayout({
  registry = EMPTY_REGISTRY,
  capabilities = EMPTY_CAPS,
  tokens = EMPTY_TOKENS,
}: PlumixEditorLayoutProps): ReactElement {
  return (
    <div className="flex h-dvh flex-col" data-testid="plumix-editor-layout">
      <header
        className="flex items-center gap-3 border-b px-4 py-2"
        data-testid="plumix-editor-header"
      >
        <input
          type="text"
          placeholder="Untitled"
          aria-label="Entry title"
          className="flex-1 bg-transparent outline-none"
          data-testid="plumix-editor-title-input"
        />
        <AutosaveStatusPill />
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          data-testid="plumix-editor-publish-button"
        >
          Publish
        </button>
      </header>
      <div
        className="grid flex-1 grid-cols-[260px_1fr] overflow-hidden md:grid-cols-[260px_1fr_320px]"
        data-testid="plumix-editor-cols"
      >
        <aside
          className="overflow-y-auto border-r"
          data-testid="plumix-editor-left"
        >
          <Tabs defaultValue="blocks" className="h-full">
            <TabsList className="w-full">
              <TabsTrigger value="blocks" data-testid="plumix-editor-tab-blocks">
                Blocks
              </TabsTrigger>
              <TabsTrigger value="outline" data-testid="plumix-editor-tab-outline">
                Outline
              </TabsTrigger>
              <TabsTrigger value="audit" data-testid="plumix-editor-tab-audit">
                Audit
              </TabsTrigger>
            </TabsList>
            <TabsContent value="blocks">
              <Puck.Components />
            </TabsContent>
            <TabsContent value="outline">
              <Puck.Outline />
            </TabsContent>
            <TabsContent value="audit">
              <PlumixAuditTab />
            </TabsContent>
          </Tabs>
        </aside>
        <PlumixCanvasWithSlashMenu
          registry={registry}
          capabilities={capabilities}
        />
        <InspectorBody registry={registry} tokens={tokens} />
      </div>
    </div>
  );
}

interface InspectorBodyProps {
  readonly registry: BlockRegistryV2;
  readonly tokens: ThemeTokens;
}

function InspectorBody({ registry, tokens }: InspectorBodyProps): ReactElement {
  const isMobile = useIsMobile();
  const content = (
    <>
      <PlumixBlockActions registry={registry} />
      <Tabs defaultValue="block" className="h-full">
        <TabsList className="w-full">
          <TabsTrigger value="block" data-testid="plumix-editor-tab-block">
            Block
          </TabsTrigger>
          <TabsTrigger value="style" data-testid="plumix-editor-tab-style">
            Style
          </TabsTrigger>
        </TabsList>
        <TabsContent value="block">
          <Puck.Fields />
        </TabsContent>
        <TabsContent value="style">
          <PlumixStyleTab tokens={tokens} />
        </TabsContent>
      </Tabs>
    </>
  );
  if (isMobile) {
    return <MobileInspectorSheet>{content}</MobileInspectorSheet>;
  }
  return (
    <aside
      className="overflow-y-auto border-l"
      data-testid="plumix-editor-right"
    >
      {content}
    </aside>
  );
}

interface PlumixCanvasWithSlashMenuProps {
  readonly registry: BlockRegistryV2;
  readonly capabilities: ReadonlySet<string>;
}

function PlumixCanvasWithSlashMenu({
  registry,
  capabilities,
}: PlumixCanvasWithSlashMenuProps): ReactElement {
  const puck = usePuck();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(
    () => resolveSlashMenuItems(registry, { capabilities, query }),
    [registry, capabilities, query],
  );

  const handleCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>): void => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.nativeEvent.isComposing
      ) {
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.matches(
          'input, textarea, [contenteditable=""], [contenteditable="true"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      setQuery("");
      setOpen(true);
    },
    [],
  );

  const handleSelect = useCallback(
    (item: SlashMenuItem): void => {
      const { itemSelector } = puck.appState.ui;
      const { zone, index } = nextInsertPoint(
        itemSelector,
        puck.appState.data.content.length,
      );
      puck.dispatch({
        type: "insert",
        componentType: item.name,
        destinationZone: zone,
        destinationIndex: index,
      });
      setOpen(false);
    },
    [puck],
  );

  return (
    <>
      <main
        className="overflow-auto"
        data-testid="plumix-editor-canvas"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
      >
        <Puck.Preview />
      </main>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md p-0"
          data-testid="slash-menu-dialog"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Insert block</DialogTitle>
            <DialogDescription>
              Search blocks by title or keyword and press Enter to insert.
            </DialogDescription>
          </DialogHeader>
          <SlashMenuPanel
            items={items}
            query={query}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onDismiss={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface PlumixStyleTabProps {
  readonly tokens: ThemeTokens;
}

function PlumixStyleTab({ tokens }: PlumixStyleTabProps): ReactElement {
  const puck = usePuck();
  const { selectedItem } = puck;
  const bucket = viewportWidthToBucket(
    puck.appState.ui.viewports.current.width,
  );

  const handleStyleChange = useCallback(
    (nextStyle: ResponsiveStyleSlot | undefined): void => {
      const { itemSelector } = puck.appState.ui;
      if (!itemSelector) return;
      puck.dispatch({
        type: "setData",
        data: (previous) => patchStyleAtSelector(previous, itemSelector, nextStyle),
      });
    },
    [puck],
  );

  return (
    <StyleTab
      tokens={tokens}
      selectedItem={selectedItem}
      bucket={bucket}
      onStyleChange={handleStyleChange}
    />
  );
}

interface PlumixBlockActionsProps {
  readonly registry: BlockRegistryV2;
}

function PlumixBlockActions({ registry }: PlumixBlockActionsProps): ReactElement {
  const puck = usePuck();
  const { selectedItem } = puck;

  const handleTransform = useCallback(
    (option: TransformOption): void => {
      const { itemSelector } = puck.appState.ui;
      if (!itemSelector || !selectedItem) return;
      const currentAttrs = selectedItem.props as Record<string, unknown>;
      const targetDefaults = registry.get(option.targetName)?.defaults ?? {};
      const mappedAttrs = option.mapAttrs?.(currentAttrs) ?? {};
      puck.dispatch({
        type: "replace",
        destinationZone: itemSelector.zone ?? PUCK_ROOT_ZONE,
        destinationIndex: itemSelector.index,
        data: {
          type: option.targetName,
          props: {
            ...targetDefaults,
            ...mappedAttrs,
            id: currentAttrs.id as string,
          },
        },
      });
    },
    [puck, selectedItem, registry],
  );

  const handleDuplicate = useCallback((): void => {
    const { itemSelector } = puck.appState.ui;
    if (!itemSelector) return;
    puck.dispatch({
      type: "duplicate",
      sourceIndex: itemSelector.index,
      sourceZone: itemSelector.zone ?? PUCK_ROOT_ZONE,
    });
  }, [puck]);

  const handleDelete = useCallback((): void => {
    const { itemSelector } = puck.appState.ui;
    if (!itemSelector) return;
    puck.dispatch({
      type: "remove",
      index: itemSelector.index,
      zone: itemSelector.zone ?? PUCK_ROOT_ZONE,
    });
  }, [puck]);

  const handleCopyJson = useCallback((): void => {
    if (!selectedItem) return;
    navigator.clipboard
      .writeText(JSON.stringify(selectedItem, null, 2))
      .catch((error: unknown) => {
        console.error(
          "[plumix:block-actions] Copy to clipboard failed:",
          error,
        );
      });
  }, [selectedItem]);

  return (
    <BlockActionsPanel
      specName={selectedItem?.type}
      registry={registry}
      onTransform={handleTransform}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onCopyJson={handleCopyJson}
    />
  );
}

