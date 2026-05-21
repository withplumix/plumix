import type {
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js";
import { useIsMobile } from "@/hooks/use-mobile.js";
import { cn } from "@/lib/utils.js";
import { Puck, usePuck } from "@puckeditor/core";
import { Minus, Monitor, Plus, Smartphone, Tablet } from "lucide-react";

import type {
  BlockRegistry,
  BlockSpec,
  InsertableBlockEntry,
  ResponsiveStyleSlot,
  ThemeTokens,
} from "@plumix/blocks";
import { createBlockRegistry, expandBlockVariations } from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import type { SlashMenuItem } from "./slash-menu-items.js";
import { AutosaveStatusPill } from "./AutosaveStatus.js";
import { BlockActionsPanel } from "./BlockActionsPanel.js";
import { BlockIcon } from "./BlockIcon.js";
import { HeadingAuditPanel } from "./HeadingAuditPanel.js";
import { mergePropsAtSelector } from "./merge-variation-attrs.js";
import { MobileSidebarSheet } from "./MobileSidebarSheet.js";
import { patchStyleAtSelector } from "./patch-style.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";
import { nextInsertPoint, resolveSlashMenuItems } from "./slash-menu-items.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";
import { StyleTab } from "./StyleTab.js";
import { viewportWidthToBucket } from "./viewport-bucket.js";

interface PlumixEditorLayoutProps {
  readonly registry?: BlockRegistry;
  readonly capabilities?: ReadonlySet<string>;
  readonly tokens?: ThemeTokens;
  readonly children?: ReactNode;
  readonly title: string;
  readonly onTitleChange: (next: string) => void;
  readonly backHref: string;
  readonly onPublish: () => void;
  readonly isPublishing?: boolean;
  readonly isPublished?: boolean;
  // Optional Revisions trigger rendered in the top-right header slot.
  // Route layer owns RPC wiring and feeds a fully-wired <RevisionsSheet />
  // here; the layout only allocates space and doesn't know the contract.
  readonly revisionsTrigger?: ReactNode;
}

const EMPTY_REGISTRY: BlockRegistry = createBlockRegistry([]);
const EMPTY_CAPS: ReadonlySet<string> = new Set();
const EMPTY_TOKENS: ThemeTokens = {};

const TOOLBAR_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
const ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface ViewportPreset {
  readonly width: number;
  readonly height: "auto";
  readonly label: string;
  readonly icon: ReactElement;
}

const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  {
    width: 360,
    height: "auto",
    label: "Mobile",
    icon: <Smartphone className="h-4 w-4" aria-hidden />,
  },
  {
    width: 768,
    height: "auto",
    label: "Tablet",
    icon: <Tablet className="h-4 w-4" aria-hidden />,
  },
  {
    width: 1280,
    height: "auto",
    label: "Desktop",
    icon: <Monitor className="h-4 w-4" aria-hidden />,
  },
];

// Puck hardcodes initial `viewports.current` to its bundled Smartphone
// (360px) preset, which lands authors in mobile preview — open on
// Desktop instead so the editor starts at the wide layout.
const DEFAULT_VIEWPORT_INDEX = 2;

interface CanvasToolbarProps {
  readonly zoom: number;
  // null clears the manual override so the canvas tracks fit-to-screen
  // again. Numeric values pin the zoom level until cleared.
  readonly onZoomChange: (next: number | null) => void;
}

function CanvasToolbar({
  zoom,
  onZoomChange,
}: CanvasToolbarProps): ReactElement {
  const puck = usePuck();
  const { viewports } = puck.appState.ui;
  const currentWidth = viewports.current.width;
  const dispatch = puck.dispatch;
  useEffect(() => {
    const target = VIEWPORT_PRESETS[DEFAULT_VIEWPORT_INDEX];
    if (!target) return;
    const { width, height } = target;
    dispatch({
      type: "setUi",
      ui: (prev) => ({
        viewports: { ...prev.viewports, current: { width, height } },
      }),
    });
  }, [dispatch]);
  const setViewport = (width: number, height: "auto"): void => {
    dispatch({
      type: "setUi",
      ui: (prev) => ({
        viewports: { ...prev.viewports, current: { width, height } },
      }),
    });
    onZoomChange(null);
  };
  // When the current zoom is between presets (e.g. fit-to-screen lands
  // at 62%), step to the next preset above or below — never get stuck
  // at the off-preset value because +/- can't find an exact-index match.
  const stepZoom = (delta: number): void => {
    const next =
      delta > 0
        ? ZOOM_STEPS.find((s) => s > zoom + 0.001)
        : [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001);
    if (next !== undefined) onZoomChange(next);
  };
  const firstStep = ZOOM_STEPS[0] ?? 0;
  const lastStep = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 1;
  const atMin = zoom <= firstStep;
  const atMax = zoom >= lastStep;
  return (
    <div
      className="bg-background flex h-10 shrink-0 items-center justify-center gap-2 border-b"
      data-testid="plumix-editor-canvas-toolbar"
    >
      <div
        className="flex items-center gap-1"
        data-testid="plumix-editor-viewports"
      >
        {VIEWPORT_PRESETS.map((v) => {
          const isActive = v.width === currentWidth;
          return (
            <button
              key={v.width}
              type="button"
              className={cn(
                TOOLBAR_BTN,
                isActive && "bg-accent text-foreground",
              )}
              data-testid={`plumix-editor-viewport-${v.width}`}
              data-active={isActive ? "true" : "false"}
              aria-label={v.label}
              aria-pressed={isActive}
              onClick={() => setViewport(v.width, v.height)}
            >
              {v.icon}
            </button>
          );
        })}
      </div>
      <div className="bg-border h-5 w-px" aria-hidden />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={TOOLBAR_BTN}
          data-testid="plumix-editor-zoom-out"
          aria-label="Zoom out"
          onClick={() => stepZoom(-1)}
          disabled={atMin}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={TOOLBAR_BTN}
          data-testid="plumix-editor-zoom-in"
          aria-label="Zoom in"
          onClick={() => stepZoom(1)}
          disabled={atMax}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="bg-border h-5 w-px" aria-hidden />
      <span
        className="text-muted-foreground w-12 text-center text-xs tabular-nums"
        data-testid="plumix-editor-zoom-percent"
      >
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

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
  title,
  onTitleChange,
  backHref,
  onPublish,
  isPublishing = false,
  isPublished = false,
  revisionsTrigger,
}: PlumixEditorLayoutProps): ReactElement {
  return (
    <div className="flex h-dvh flex-col" data-testid="plumix-editor-layout">
      <header
        className="bg-background flex h-12 shrink-0 items-center gap-3 border-b px-4"
        data-testid="plumix-editor-header"
      >
        <a
          href={backHref}
          aria-label="Back to list"
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm"
          data-testid="plumix-editor-back-button"
        >
          ←
        </a>
        <input
          type="text"
          placeholder="Untitled"
          aria-label="Entry title"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-2 text-base font-medium outline-none"
          data-testid="plumix-editor-title-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
        <AutosaveStatusPill />
        {revisionsTrigger}
        <button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
          data-testid="plumix-editor-publish-button"
          onClick={onPublish}
          disabled={isPublishing || isPublished}
        >
          Publish
        </button>
      </header>
      <div
        className="grid flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden md:grid-cols-[260px_minmax(0,1fr)_320px]"
        data-testid="plumix-editor-cols"
      >
        <BlocksBody registry={registry} capabilities={capabilities} />
        <PlumixCanvasWithSlashMenu
          registry={registry}
          capabilities={capabilities}
        />
        <InspectorBody registry={registry} tokens={tokens} />
      </div>
    </div>
  );
}

interface BlocksBodyProps {
  readonly registry: BlockRegistry;
  readonly capabilities: ReadonlySet<string>;
}

function BlocksBody({ registry, capabilities }: BlocksBodyProps): ReactElement {
  const isMobile = useIsMobile();
  const content = (
    <Tabs defaultValue="blocks" className="h-full">
      <div className="px-4 pt-4">
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
      </div>
      <TabsContent value="blocks">
        <PlumixBlocksTab registry={registry} capabilities={capabilities} />
      </TabsContent>
      <TabsContent value="outline">
        <Puck.Outline />
      </TabsContent>
      <TabsContent value="audit">
        <PlumixAuditTab />
      </TabsContent>
    </Tabs>
  );
  if (isMobile) {
    return (
      <MobileSidebarSheet
        triggerLabel="Blocks"
        triggerTestId="plumix-editor-mobile-blocks-trigger"
        triggerSide="left"
        sheetTitle="Blocks"
        sheetDescription="Insertable blocks, outline, and the heading audit for this entry."
      >
        {content}
      </MobileSidebarSheet>
    );
  }
  return (
    <aside
      className="overflow-y-auto border-r"
      data-testid="plumix-editor-left"
    >
      {content}
    </aside>
  );
}

interface PlumixBlocksTabProps {
  readonly registry: BlockRegistry;
  readonly capabilities: ReadonlySet<string>;
}

function PlumixBlocksTab({
  registry,
  capabilities,
}: PlumixBlocksTabProps): ReactElement {
  const puck = usePuck();
  const entries = useMemo(() => {
    const eligible: BlockSpec[] = [];
    for (const spec of registry) {
      if (spec.inserter === false) continue;
      if (spec.capability && !capabilities.has(spec.capability)) continue;
      eligible.push(spec);
    }
    return expandBlockVariations(eligible);
  }, [registry, capabilities]);

  const handleInsert = useCallback(
    (entry: InsertableBlockEntry): void => {
      const index = puck.appState.data.content.length;
      puck.dispatch({
        type: "insert",
        componentType: entry.name,
        destinationZone: PUCK_ROOT_ZONE,
        destinationIndex: index,
      });
      const variationAttrs = entry.attrs;
      if (variationAttrs !== undefined) {
        puck.dispatch({
          type: "setData",
          data: (previous) =>
            mergePropsAtSelector(
              previous,
              { zone: PUCK_ROOT_ZONE, index },
              variationAttrs,
            ),
        });
      }
    },
    [puck],
  );

  return (
    <ul className="flex flex-col gap-1 p-2" data-testid="plumix-blocks-tab">
      {entries.map((entry) => (
        <li key={entry.slug}>
          <button
            type="button"
            className="hover:bg-muted flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm"
            data-testid={`plumix-blocks-tab-item-${entry.slug}`}
            onClick={() => handleInsert(entry)}
          >
            <BlockIcon name={entry.icon} />
            <span className="truncate">{entry.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface InspectorBodyProps {
  readonly registry: BlockRegistry;
  readonly tokens: ThemeTokens;
}

function InspectorBody({ registry, tokens }: InspectorBodyProps): ReactElement {
  const isMobile = useIsMobile();
  const content = (
    <>
      <PlumixBlockActions registry={registry} />
      <Tabs defaultValue="block" className="h-full">
        <div className="px-4 pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="block" data-testid="plumix-editor-tab-block">
              Block
            </TabsTrigger>
            <TabsTrigger value="style" data-testid="plumix-editor-tab-style">
              Style
            </TabsTrigger>
          </TabsList>
        </div>
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
    return (
      <MobileSidebarSheet
        triggerLabel="Inspector"
        triggerTestId="plumix-editor-mobile-inspector-trigger"
        triggerSide="right"
        sheetTitle="Inspector"
        sheetDescription="Block actions, fields, and style controls for the selected block."
      >
        {content}
      </MobileSidebarSheet>
    );
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
  readonly registry: BlockRegistry;
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
      const variationAttrs = item.attrs;
      if (variationAttrs !== undefined) {
        puck.dispatch({
          type: "setData",
          data: (previous) =>
            mergePropsAtSelector(previous, { zone, index }, variationAttrs),
        });
      }
      setOpen(false);
    },
    [puck],
  );

  const currentViewportWidth = puck.appState.ui.viewports.current.width;
  const viewportPx =
    typeof currentViewportWidth === "number"
      ? currentViewportWidth
      : VIEWPORT_PRESETS[DEFAULT_VIEWPORT_INDEX]?.width ?? 1280;
  // `null` keeps the canvas at fit-to-screen; an explicit number is
  // the manual override the zoom +/- buttons emit.
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [mainInnerWidth, setMainInnerWidth] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = (): void => {
      const styles = window.getComputedStyle(el);
      const padX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      setMainInnerWidth(el.clientWidth - padX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fitZoom =
    mainInnerWidth > 0 ? Math.min(1, mainInnerWidth / viewportPx) : 1;
  const zoom = manualZoom ?? fitZoom;

  return (
    <div
      className="flex min-h-0 flex-col"
      data-testid="plumix-editor-canvas-column"
    >
      <CanvasToolbar zoom={zoom} onZoomChange={setManualZoom} />
      <main
        ref={mainRef}
        className="bg-muted/30 flex-1 overflow-auto px-8 py-6"
        data-testid="plumix-editor-canvas"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
      >
        <div
          className="bg-background mx-auto rounded-md border p-8 shadow-sm transition-[width]"
          style={{ width: viewportPx, zoom }}
          data-testid="plumix-editor-canvas-frame"
        >
          <Puck.Preview />
        </div>
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
    </div>
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
        data: (previous) =>
          patchStyleAtSelector(previous, itemSelector, nextStyle),
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
  readonly registry: BlockRegistry;
}

function PlumixBlockActions({
  registry,
}: PlumixBlockActionsProps): ReactElement {
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
