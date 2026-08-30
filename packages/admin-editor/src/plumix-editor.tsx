import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Trans } from "@lingui/react";

import type {
  BlockRegistry,
  EntryContent,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@plumix/admin-ui/sidebar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@plumix/admin-ui/tabs";
import { defineEntryContent } from "@plumix/blocks";

import type { InserterPattern } from "./block-catalog.js";
import type { ResolvePluginFieldType } from "./block-input-control.js";
import type { PublishActions } from "./editor-toolbar.js";
import type { RightPanel } from "./store.js";
import { BlockCatalog } from "./block-catalog-tab.js";
import { BlockInspector } from "./block-inspector.js";
import { CanvasFrame } from "./canvas-frame.js";
import { EditorCommandPalette } from "./editor-command-palette.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorHeader } from "./editor-header.js";
import { EditorShortcuts, EditorToolbar } from "./editor-toolbar.js";
import { JsonSourceDialog } from "./json-inspector.js";
import { LayersTab } from "./layers-tab.js";
import {
  EditorProvider,
  useEditorStore,
  useEditorStoreApi,
} from "./provider.js";
import { selectStarterPatterns } from "./select-starter-patterns.js";
import { ShortcutsDialog } from "./shortcuts-dialog.js";
import { StarterModal } from "./starter-modal.js";
import { StylesTab } from "./styles-tab.js";

const NO_CAPABILITIES: ReadonlySet<string> = new Set();
// A stable empty-tokens default, so an editor mounted without a theme doesn't
// hand the config provider a fresh `{}` each render (which would defeat its
// memo and re-render every panel). Mirrors NO_CAPABILITIES above.
const NO_TOKENS: ThemeTokens = {};

interface PlumixEditorProps {
  /** Seed content; the editor owns state thereafter (uncontrolled). */
  readonly defaultValue?: EntryContent;
  /** URL the canvas iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
  /** Core + plugin block registry, supplying the inspector + catalog schemas. */
  readonly registry: BlockRegistry;
  /** Viewer capabilities, gating which blocks the catalog offers. */
  readonly capabilities?: ReadonlySet<string>;
  /** Theme + plugin patterns offered in the inserter alongside the blocks. */
  readonly patterns?: readonly InserterPattern[];
  /** The entry type being authored (e.g. `"post"`). Selects which `patterns`
   *  qualify as starters for the blank-entry picker; without it, only
   *  type-agnostic starters are offered. */
  readonly entryType?: string;
  /** Theme breakpoints sizing the device-switch canvas widths. */
  readonly breakpoints?: ThemeBreakpoints;
  /** Theme tokens offered in the Styles tab's token-or-custom controls. */
  readonly tokens?: ThemeTokens;
  /** Preview mode: render the canvas read-only with the editing chrome hidden
   *  (used to view a past revision or a shared draft). */
  readonly readOnly?: boolean;
  /** Banner shown above the canvas in preview mode (e.g. revision + restore). */
  readonly previewBanner?: ReactNode;
  /** A shareable `?preview=…` URL; surfaces "View current draft" in the header. */
  readonly previewLink?: string;
  /** Public permalink for "View live entry"; absent until first published. */
  readonly liveUrl?: string;
  /** Entry title, shown and edited inline in the header. */
  readonly title?: string;
  /** Persists a header title edit (host owns persistence). */
  readonly onTitleChange?: (title: string) => void;
  /** Returns to the entry list from the header's back button. */
  readonly onBack?: () => void;
  /** Fires with the full content envelope whenever the tree changes. The host
   *  debounces + persists (orpc lives in the app, never in this package). */
  readonly onChange?: (content: EntryContent) => void;
  /** Admin-provided document settings (slug/excerpt/parent/metaboxes) rendered
   *  in the Page tab; the host owns its persistence. */
  readonly documentPanel?: ReactNode;
  /** Publish / save-draft / discard wiring for the toolbar (host mutations). */
  readonly publish?: PublishActions;
  /** Host-rendered "Revisions" affordance for the header, opening the
   *  revision-history sheet. Kept as a slot so the orpc-backed sheet lives in
   *  the app; absent when the entry type doesn't support revisions. */
  readonly revisionsTrigger?: ReactNode;
  /** Opens that same sheet from the command palette. Absent when the entry
   *  type has no revisions, and the palette then offers no such command. */
  readonly onOpenRevisions?: () => void;
  /** Host-rendered overlay (e.g. the stale-draft resolution dialog). */
  readonly overlay?: ReactNode;
  /** Re-run the active block's loader(s) server-side (host orpc call). When set,
   *  a loader-backed block gets a "Refresh data" control; the returned data is
   *  pushed to the canvas. orpc lives in the app, never in this package. */
  readonly onRefreshBlockLoader?: (
    blockId: string,
  ) => Promise<SerializedLoaderData>;
  /** Monotonic token the host bumps after autosaving a template-rendered entry
   *  field (title / excerpt / meta / …); each change reloads the canvas so
   *  those fields refresh. Block content syncs over the bridge and needs no
   *  reload. */
  readonly previewRefreshToken?: number;
  /** Resolves plugin-registered block-input types (e.g. the media picker) to a
   *  control, wired from the app's field-type registry. Kept as a prop so this
   *  package stays decoupled from the registry. */
  readonly resolvePluginFieldType?: ResolvePluginFieldType;
}

/**
 * The editor's host shell: the canvas iframe plus the right-rail
 * attribute inspector. Owns the editor store; persistence is the host app's
 * job, wired via `onChange`.
 */
export function PlumixEditor({
  defaultValue,
  previewUrl,
  origin,
  registry,
  capabilities = NO_CAPABILITIES,
  patterns,
  entryType,
  breakpoints,
  tokens,
  readOnly = false,
  previewBanner,
  previewLink,
  liveUrl,
  title,
  onTitleChange,
  onBack,
  onChange,
  documentPanel,
  publish,
  revisionsTrigger,
  onOpenRevisions,
  overlay,
  onRefreshBlockLoader,
  previewRefreshToken,
  resolvePluginFieldType,
}: PlumixEditorProps): ReactElement {
  // Starter patterns eligible for this entry type, offered to a blank entry.
  const starterCandidates = useMemo(
    () => selectStarterPatterns(patterns ?? [], entryType),
    [patterns, entryType],
  );
  const seedStarterOpen =
    (defaultValue?.blocks.length ?? 0) === 0 && starterCandidates.length > 0;

  if (readOnly) {
    return (
      <EditorProvider
        initialTree={defaultValue?.blocks}
        breakpoints={breakpoints}
      >
        <EditorConfigProvider
          registry={registry}
          tokens={tokens ?? NO_TOKENS}
          capabilities={capabilities}
          resolvePluginFieldType={resolvePluginFieldType}
        >
          <div
            className="flex h-full min-h-0 flex-col"
            data-testid="plumix-editor-preview"
          >
            {previewBanner}
            <CanvasFrame previewUrl={previewUrl} origin={origin} readOnly />
          </div>
          {overlay}
        </EditorConfigProvider>
      </EditorProvider>
    );
  }
  return (
    <EditorProvider
      initialTree={defaultValue?.blocks}
      breakpoints={breakpoints}
      starterOpen={seedStarterOpen}
    >
      <EditorConfigProvider
        registry={registry}
        tokens={tokens ?? NO_TOKENS}
        capabilities={capabilities}
        resolvePluginFieldType={resolvePluginFieldType}
      >
        {/* shadcn sidebar-16 pattern: a flex-col provider with a full-width
            header, then a flex row whose offcanvas rails (position: fixed) are
            offset below the header by --header-height. */}
        <SidebarProvider
          className="flex h-full min-h-0 flex-col"
          style={
            {
              "--sidebar-width": "18rem",
              "--header-height": "3.25rem",
            } as CSSProperties
          }
          data-testid="plumix-editor-layout"
        >
          <EditorHeader
            title={title}
            onTitleChange={onTitleChange}
            onBack={onBack}
            publish={publish}
            previewLink={previewLink}
            liveUrl={liveUrl}
            revisionsTrigger={revisionsTrigger}
          />
          <div className="flex min-h-0 flex-1">
            <Sidebar
              side="left"
              collapsible="offcanvas"
              className="top-(--header-height) !h-[calc(100svh-var(--header-height))]"
              data-testid="plumix-editor-left"
            >
              <Tabs
                defaultValue="blocks"
                className="flex h-full min-h-0 flex-col"
              >
                <SidebarHeader>
                  <TabsList>
                    <TabsTrigger value="blocks" data-testid="plumix-tab-blocks">
                      <Trans id="editor.tab.blocks" message="Blocks" />
                    </TabsTrigger>
                    <TabsTrigger value="layers" data-testid="plumix-tab-layers">
                      <Trans id="editor.tab.layers" message="Layers" />
                    </TabsTrigger>
                  </TabsList>
                </SidebarHeader>
                <SidebarContent>
                  <TabsContent value="blocks">
                    <BlockCatalog patterns={patterns} entryType={entryType} />
                  </TabsContent>
                  <TabsContent value="layers">
                    <LayersTab />
                  </TabsContent>
                </SidebarContent>
              </Tabs>
            </Sidebar>
            <SidebarInset className="min-w-0">
              <EditorToolbar hasStarters={starterCandidates.length > 0} />
              <CanvasFrame
                previewUrl={previewUrl}
                origin={origin}
                entryType={entryType}
                previewRefreshToken={previewRefreshToken}
              />
            </SidebarInset>
            <RightRail
              documentPanel={documentPanel}
              onRefreshBlockLoader={onRefreshBlockLoader}
            />
          </div>
        </SidebarProvider>
        <EditorShortcuts />
        <EditorCommandPalette
          entryType={entryType}
          onOpenRevisions={onOpenRevisions}
        />
        <JsonSourceDialog />
        <ShortcutsDialog />
        <StarterModal candidates={starterCandidates} />
        {overlay}
        {onChange ? <TreeChangeEmitter onChange={onChange} /> : null}
      </EditorConfigProvider>
    </EditorProvider>
  );
}

/**
 * The right inspector rail (Block / Styles / Page). Its tab is store-controlled
 * so selections can steer which panel is shown.
 */
function RightRail({
  documentPanel,
  onRefreshBlockLoader,
}: {
  readonly documentPanel?: ReactNode;
  readonly onRefreshBlockLoader?: (
    blockId: string,
  ) => Promise<SerializedLoaderData>;
}): ReactElement {
  const rightPanel = useEditorStore((s) => s.rightPanel);
  const setRightPanel = useEditorStore((s) => s.setRightPanel);
  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      className="top-(--header-height) !h-[calc(100svh-var(--header-height))]"
      data-testid="plumix-editor-right"
    >
      <Tabs
        value={rightPanel}
        onValueChange={(value) => setRightPanel(value as RightPanel)}
        className="flex h-full min-h-0 flex-col"
      >
        <SidebarHeader>
          <TabsList>
            <TabsTrigger value="block" data-testid="plumix-tab-block">
              <Trans id="editor.tab.block" message="Block" />
            </TabsTrigger>
            <TabsTrigger value="styles" data-testid="plumix-tab-styles">
              <Trans id="editor.tab.styles" message="Styles" />
            </TabsTrigger>
            <TabsTrigger value="page" data-testid="plumix-tab-page">
              <Trans id="editor.tab.page" message="Page" />
            </TabsTrigger>
          </TabsList>
        </SidebarHeader>
        <SidebarContent>
          <TabsContent value="block">
            <BlockInspector onRefreshBlockLoader={onRefreshBlockLoader} />
          </TabsContent>
          <TabsContent value="styles">
            <StylesTab />
          </TabsContent>
          <TabsContent value="page" data-testid="plumix-page-panel">
            {documentPanel ?? (
              <p className="text-muted-foreground p-4 text-sm">
                <Trans id="editor.page.empty" message="No document settings." />
              </p>
            )}
          </TabsContent>
        </SidebarContent>
      </Tabs>
    </Sidebar>
  );
}

/**
 * Subscribes to canonical-tree changes and emits the content envelope. Kept a
 * child of EditorProvider so it can reach the store; the latest `onChange` is
 * held in a ref so re-subscribing isn't needed when the callback identity
 * changes between renders.
 */
export function TreeChangeEmitter({
  onChange,
}: {
  readonly onChange: (content: EntryContent) => void;
}): null {
  const store = useEditorStoreApi();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(
    () =>
      store.subscribe((state, prev) => {
        if (state.tree !== prev.tree) {
          onChangeRef.current(defineEntryContent(state.tree));
        }
      }),
    [store],
  );
  return null;
}
