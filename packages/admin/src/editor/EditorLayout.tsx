import type {
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button.js";
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
import { getPatterns } from "@/lib/manifest.js";
import { cn } from "@/lib/utils.js";
import { Puck, usePuck } from "@puckeditor/core";
import { Minus, Monitor, Plus, Smartphone, Tablet } from "lucide-react";

import type {
  BlockRegistry,
  BlockSpec,
  BlockVariation,
  InsertableBlockEntry,
  PatternRegistry,
  ResponsiveStyleSlot,
  ThemeTokens,
} from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";
import {
  createBlockRegistry,
  createPatternRegistry,
  expandBlockVariations,
  resolveBlockScopeVariations,
} from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import type { SlashMenuItem } from "./slash-menu-items.js";
import { AutosaveStatusPill } from "./AutosaveStatus.js";
import { deriveBlockIdentity } from "./block-identity.js";
import { BlockActionsPanel } from "./BlockActionsPanel.js";
import { BlockScopePicker } from "./BlockScopePicker.js";
import { buildCopyPatternSource } from "./build-copy-pattern-source.js";
import { HeadingAuditPanel } from "./HeadingAuditPanel.js";
import { insertPattern } from "./insert-pattern.js";
import { dispatchVariationInsert } from "./insert-variation.js";
import { InsertableEntryRow } from "./InsertableEntryRow.js";
import { entryKey, isVariation } from "./is-variation.js";
import { MobileSidebarSheet } from "./MobileSidebarSheet.js";
import { patchStyleAtSelector } from "./patch-style.js";
import { PatternRefProvider } from "./PatternRefPreview.js";
import { PatternsSection } from "./PatternsSection.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";
import { nextInsertPoint, resolveSlashMenuItems } from "./slash-menu-items.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";
import { StarterModal } from "./StarterModal.js";
import { StyleTab } from "./StyleTab.js";
import { useStarterModalState } from "./use-starter-modal-state.js";
import { viewportWidthToBucket } from "./viewport-bucket.js";

interface PlumixEditorLayoutProps {
  readonly registry?: BlockRegistry;
  readonly patternRegistry?: PatternRegistry;
  // Pre-filtered starter patterns surfaced in the entry-create modal.
  // Route owns the filter (entry type / capability); the layout just
  // renders what it's given.
  readonly starterCandidates?: readonly PatternManifestEntry[];
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
  // Optional co-author indicator (avatar group + last-seen labels)
  // surfaced next to the autosave pill. Route layer owns the
  // `entry.activity.list` polling; the layout just allocates space.
  readonly coAuthorIndicator?: ReactNode;
  // Optional preview-mode banner rendered above the header. When set,
  // the route is in `?revision=<id>` preview mode — the title input
  // and publish button are hidden because edits don't autosave.
  readonly previewBanner?: ReactNode;
  // edit-with-draft mode: replaces the lone Publish button with three
  // actions (Discard / Save Draft / Publish) and renders an
  // "unpublished changes" banner above the header when the entry is
  // currently loaded from an autosave row. Driven through explicit
  // state props (rather than ReactNode slots) so the layout owns the
  // visual contract; route layer just wires the callbacks.
  readonly draftMode?: {
    readonly hasPendingDraft: boolean;
    readonly onSaveDraft: () => void;
    readonly onPublishDraft: () => void;
    readonly onDiscardDraft: () => void;
    readonly isSaving: boolean;
    readonly isPublishing: boolean;
    readonly isDiscarding: boolean;
  };
}

const EMPTY_REGISTRY: BlockRegistry = createBlockRegistry([]);
const EMPTY_PATTERN_REGISTRY: PatternRegistry = createPatternRegistry([]);
const EMPTY_STARTER_CANDIDATES: readonly PatternManifestEntry[] = Object.freeze(
  [],
);
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
  // Visible only while the entry is empty AND starter candidates exist
  // — re-summons the starter modal after a dismissal so authors can
  // change their mind before they start building.
  readonly canReopenStarter: boolean;
  readonly onReopenStarter: () => void;
  // Writes the current selection (or whole doc when no selection) to
  // the clipboard as a paste-ready `definePattern({...})` snippet.
  readonly onCopyAsPatternSource: () => void;
}

function CanvasToolbar({
  zoom,
  onZoomChange,
  canReopenStarter,
  onReopenStarter,
  onCopyAsPatternSource,
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
  // Step to the next preset strictly above/below the current zoom. The
  // 1 % tolerance keeps a step away from an effectively-equal preset
  // (e.g. fit-to-screen at 0.497 should still snap UP to 0.75, not
  // shuffle to 0.5 and display the same percentage).
  const stepZoom = (delta: number): void => {
    const next =
      delta > 0
        ? ZOOM_STEPS.find((s) => s > zoom + 0.01)
        : [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01);
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
      {canReopenStarter ? (
        <>
          <div className="bg-border h-5 w-px" aria-hidden />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center rounded-md px-2 text-xs"
            data-testid="plumix-editor-replace-starter"
            onClick={onReopenStarter}
          >
            Pick a starter…
          </button>
        </>
      ) : null}
      <div className="bg-border h-5 w-px" aria-hidden />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center rounded-md px-2 text-xs"
        data-testid="plumix-editor-copy-as-pattern-source"
        onClick={onCopyAsPatternSource}
      >
        Copy as pattern source
      </button>
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

interface LivePublishButtonProps {
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
  readonly isPublished: boolean;
}

function LivePublishButton({
  onPublish,
  isPublishing,
  isPublished,
}: LivePublishButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
      data-testid="plumix-editor-publish-button"
      onClick={onPublish}
      disabled={isPublishing || isPublished}
    >
      Publish
    </button>
  );
}

interface DraftActionsProps {
  readonly draftMode: NonNullable<PlumixEditorLayoutProps["draftMode"]>;
}

// Three-action header for edit-with-draft mode. Discard and Publish
// disable when there's no pending draft (mirrors the server's
// NO_PENDING_DRAFT shape); Save Draft stays available so a pristine
// published row can be edited and saved as the first draft.
function DraftActions({ draftMode }: DraftActionsProps): ReactElement {
  const anyInFlight =
    draftMode.isSaving || draftMode.isPublishing || draftMode.isDiscarding;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        data-testid="editor-draft-discard"
        onClick={draftMode.onDiscardDraft}
        disabled={anyInFlight || !draftMode.hasPendingDraft}
      >
        {draftMode.isDiscarding ? "Discarding…" : "Discard"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="editor-draft-save"
        onClick={draftMode.onSaveDraft}
        disabled={anyInFlight}
      >
        {draftMode.isSaving ? "Saving…" : "Save Draft"}
      </Button>
      <Button
        variant="default"
        size="sm"
        data-testid="editor-draft-publish"
        onClick={draftMode.onPublishDraft}
        disabled={anyInFlight || !draftMode.hasPendingDraft}
      >
        {draftMode.isPublishing ? "Publishing…" : "Publish"}
      </Button>
    </div>
  );
}

export function PlumixEditorLayout({
  registry = EMPTY_REGISTRY,
  patternRegistry = EMPTY_PATTERN_REGISTRY,
  starterCandidates = EMPTY_STARTER_CANDIDATES,
  capabilities = EMPTY_CAPS,
  tokens = EMPTY_TOKENS,
  title,
  onTitleChange,
  backHref,
  onPublish,
  isPublishing = false,
  isPublished = false,
  revisionsTrigger,
  coAuthorIndicator,
  previewBanner,
  draftMode,
}: PlumixEditorLayoutProps): ReactElement {
  const isPreview = previewBanner !== undefined;
  const isDraftMode = draftMode !== undefined;
  const showDraftBanner = isDraftMode && draftMode.hasPendingDraft;
  const patterns = useMemo(() => getPatterns(), []);
  const refContextValue = useMemo(
    () => ({ patterns: patternRegistry, blocks: registry }),
    [patternRegistry, registry],
  );
  return (
    <PatternRefProvider value={refContextValue}>
      <div className="flex h-dvh flex-col" data-testid="plumix-editor-layout">
        {previewBanner}
        {showDraftBanner ? (
          // Static banner — no `role="status"` because a live region
          // containing a button gets re-announced on every state change,
          // which makes the Discard button noisy for screen readers.
          // Dark-mode contrast: `amber-900/30` background pairs with
          // `amber-100` text at ~4.5:1 (AA for normal text); the original
          // `amber-950/40` measured ~3.8:1.
          <div
            data-testid="unpublished-changes-banner"
            className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          >
            <span className="font-medium">
              You have unpublished draft changes.
            </span>
            <span>Click Publish to push them live, or Discard to revert.</span>
            <Button
              variant="ghost"
              size="sm"
              data-testid="unpublished-changes-banner-discard"
              onClick={draftMode.onDiscardDraft}
              disabled={draftMode.isDiscarding}
              className="ml-auto"
            >
              {draftMode.isDiscarding ? "Discarding…" : "Discard"}
            </Button>
          </div>
        ) : null}
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
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-2 text-base font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="plumix-editor-title-input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={isPreview}
          />
          {isPreview ? null : <AutosaveStatusPill />}
          {isPreview ? null : coAuthorIndicator}
          {revisionsTrigger}
          {isPreview ? null : isDraftMode ? (
            <DraftActions draftMode={draftMode} />
          ) : (
            <LivePublishButton
              onPublish={onPublish}
              isPublishing={isPublishing}
              isPublished={isPublished}
            />
          )}
        </header>
        <div
          className="grid flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden md:grid-cols-[260px_minmax(0,1fr)_320px]"
          data-testid="plumix-editor-cols"
        >
          <BlocksBody
            registry={registry}
            patternRegistry={patternRegistry}
            capabilities={capabilities}
            patterns={patterns}
          />
          {isPreview ? (
            // Puck's `permissions` strips drag / insert / delete / dup /
            // edit, but Tiptap inside rich-text fields keeps its own
            // `editable: true`. Cover the canvas with a transparent
            // overlay so the user can't type into rich-text without
            // realising preview mode skips autosave.
            <div
              className="relative"
              data-testid="plumix-editor-preview-shield"
            >
              <div
                aria-hidden
                className="bg-background/0 pointer-events-auto absolute inset-0 z-10"
              />
              <div className="pointer-events-none h-full">
                <PlumixCanvasWithSlashMenu
                  registry={registry}
                  patternRegistry={patternRegistry}
                  capabilities={capabilities}
                  patterns={patterns}
                  starterCandidates={starterCandidates}
                  entryTitle={title}
                />
              </div>
            </div>
          ) : (
            <PlumixCanvasWithSlashMenu
              registry={registry}
              patternRegistry={patternRegistry}
              capabilities={capabilities}
              patterns={patterns}
              starterCandidates={starterCandidates}
              entryTitle={title}
            />
          )}
          <InspectorBody registry={registry} tokens={tokens} />
        </div>
      </div>
    </PatternRefProvider>
  );
}

interface BlocksBodyProps {
  readonly registry: BlockRegistry;
  readonly patternRegistry: PatternRegistry;
  readonly capabilities: ReadonlySet<string>;
  readonly patterns: readonly PatternManifestEntry[];
}

function BlocksBody({
  registry,
  patternRegistry,
  capabilities,
  patterns,
}: BlocksBodyProps): ReactElement {
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
        <PlumixBlocksTab
          registry={registry}
          patternRegistry={patternRegistry}
          capabilities={capabilities}
          patterns={patterns}
        />
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
  readonly patternRegistry: PatternRegistry;
  readonly capabilities: ReadonlySet<string>;
  readonly patterns: readonly PatternManifestEntry[];
}

interface PendingPick {
  readonly entry: InsertableBlockEntry;
  readonly variations: readonly BlockVariation[];
}

function PlumixBlocksTab({
  registry,
  patternRegistry,
  capabilities,
  patterns,
}: PlumixBlocksTabProps): ReactElement {
  const puck = usePuck();
  const [pendingPick, setPendingPick] = useState<PendingPick | undefined>();
  const entries = useMemo(() => {
    const eligible: BlockSpec[] = [];
    for (const spec of registry) {
      if (spec.inserter === false) continue;
      if (spec.capability && !capabilities.has(spec.capability)) continue;
      eligible.push(spec);
    }
    return expandBlockVariations(eligible);
  }, [registry, capabilities]);

  const insertEntry = useCallback(
    (entry: InsertableBlockEntry): void => {
      dispatchVariationInsert(
        puck.dispatch,
        entry,
        puck.appState.data.content.length,
      );
    },
    [puck],
  );

  const handleInsert = useCallback(
    (entry: InsertableBlockEntry): void => {
      // Parent-block card: if the block declares any `scope: ["block"]`
      // variations the user can still pick, open the picker. Otherwise
      // (no variations, or all capability-gated out) fall through to
      // bare insert with `blockSpec.defaults`.
      if (!isVariation(entry)) {
        const blockScoped = resolveBlockScopeVariations(
          registry,
          entry.name,
          capabilities,
        );
        if (blockScoped.length > 0) {
          setPendingPick({ entry, variations: blockScoped });
          return;
        }
      }
      insertEntry(entry);
    },
    [insertEntry, registry, capabilities],
  );

  const handlePatternInsert = useCallback(
    (pattern: PatternManifestEntry): void => {
      puck.dispatch({
        type: "setData",
        data: (previous) =>
          insertPattern(previous, pattern, previous.content.length),
      });
    },
    [puck],
  );

  const handlePickerSelect = useCallback(
    (variation: BlockVariation): void => {
      if (!pendingPick) return;
      const picked: InsertableBlockEntry = {
        name: pendingPick.entry.name,
        slug: `${pendingPick.entry.name}/${variation.slug}`,
        title: variation.title,
        attrs: variation.attrs,
        innerBlocks: variation.innerBlocks,
      };
      insertEntry(picked);
      setPendingPick(undefined);
    },
    [insertEntry, pendingPick],
  );

  const handlePickerDismiss = useCallback((): void => {
    if (!pendingPick) return;
    // ESC / cancel falls back to the bare parent block — Puck applies
    // the spec's `defaults` on render.
    const bare: InsertableBlockEntry = {
      name: pendingPick.entry.name,
      slug: pendingPick.entry.slug,
      title: pendingPick.entry.title,
    };
    insertEntry(bare);
    setPendingPick(undefined);
  }, [insertEntry, pendingPick]);

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col gap-1 p-4" data-testid="plumix-blocks-tab">
        {entries.map((entry) => (
          <li key={entryKey(entry)}>
            <InsertableEntryRow
              entry={entry}
              blocks={registry}
              patterns={patternRegistry}
              onClick={() => handleInsert(entry)}
            />
          </li>
        ))}
      </ul>
      <PatternsSection
        patterns={patterns}
        onSelect={handlePatternInsert}
        blocks={registry}
        patternRegistry={patternRegistry}
      />
      {pendingPick ? (
        <BlockScopePicker
          blockTitle={pendingPick.entry.title}
          parentBlockName={pendingPick.entry.name}
          variations={pendingPick.variations}
          blocks={registry}
          patterns={patternRegistry}
          onSelect={handlePickerSelect}
          onDismiss={handlePickerDismiss}
        />
      ) : null}
    </div>
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
  readonly patternRegistry: PatternRegistry;
  readonly capabilities: ReadonlySet<string>;
  readonly patterns: readonly PatternManifestEntry[];
  readonly starterCandidates: readonly PatternManifestEntry[];
  // Entry title — drives both the emitted snippet's `title` field and
  // its derived `name` slug for the Copy-as-pattern-source action.
  readonly entryTitle: string;
}

function PlumixCanvasWithSlashMenu({
  registry,
  patternRegistry,
  capabilities,
  patterns,
  starterCandidates,
  entryTitle,
}: PlumixCanvasWithSlashMenuProps): ReactElement {
  const puck = usePuck();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Captured once at mount: the modal's initial open state must reflect
  // the entry as it was loaded, not later state changes that follow a
  // pattern seed.
  const [initiallyEmpty] = useState(
    () => puck.appState.data.content.length === 0,
  );
  const starterState = useStarterModalState({
    initiallyEmpty,
    candidates: starterCandidates,
  });
  const handleStarterSelect = useCallback(
    (pattern: PatternManifestEntry): void => {
      puck.dispatch({
        type: "setData",
        data: (previous) => insertPattern(previous, pattern, 0),
      });
      starterState.dismiss();
    },
    [puck, starterState],
  );

  const items = useMemo(
    () => resolveSlashMenuItems(registry, { capabilities, query, patterns }),
    [registry, capabilities, query, patterns],
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
      if (item.kind === "block") {
        // Variation insert operates on the root content array; nested
        // zones fall back to end-of-document so innerBlocks (which must
        // sit in a top-level slot the walker recognises) never land in
        // the wrong shape.
        const insertIndex =
          zone === PUCK_ROOT_ZONE ? index : puck.appState.data.content.length;
        dispatchVariationInsert(puck.dispatch, item.entry, insertIndex);
      } else {
        // The pattern insert primitive operates on the root content
        // array; nextInsertPoint may have returned a nested zone for
        // selection-aware placement, but pattern insertion at non-root
        // zones is deferred — fall back to end-of-document.
        const insertIndex =
          zone === PUCK_ROOT_ZONE ? index : puck.appState.data.content.length;
        puck.dispatch({
          type: "setData",
          data: (previous) => insertPattern(previous, item.entry, insertIndex),
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
      : (VIEWPORT_PRESETS[DEFAULT_VIEWPORT_INDEX]?.width ?? 1280);
  // `null` keeps the canvas at fit-to-screen; an explicit number is
  // the manual override the zoom +/- buttons emit.
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [mainInnerWidth, setMainInnerWidth] = useState(0);
  // useLayoutEffect so the synchronous initial measure runs before
  // paint — without it the canvas flashes 100% for one frame before
  // dropping to the fit value, which races CI tests that click the
  // zoom buttons immediately after navigation.
  useLayoutEffect(() => {
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

  const handleCopyAsPatternSource = useCallback((): void => {
    const source = buildCopyPatternSource({
      title: entryTitle,
      data: puck.appState.data,
      selectedItem: puck.selectedItem ?? null,
      // EditorLayout still in denylist — passes the raw fallback for
      // now; flips to `useLabel(M.untitled)` when this surface wraps.
      untitledTitle: "Untitled",
    });
    navigator.clipboard.writeText(source).catch((error: unknown) => {
      console.error(
        "[plumix:copy-as-pattern-source] clipboard write failed:",
        error,
      );
    });
  }, [puck, entryTitle]);

  return (
    <div
      className="flex min-h-0 flex-col"
      data-testid="plumix-editor-canvas-column"
    >
      <CanvasToolbar
        zoom={zoom}
        onZoomChange={setManualZoom}
        canReopenStarter={
          puck.appState.data.content.length === 0 &&
          starterCandidates.length > 0
        }
        onReopenStarter={starterState.reopen}
        onCopyAsPatternSource={handleCopyAsPatternSource}
      />
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
            <DialogTitle>Insert block or pattern</DialogTitle>
            <DialogDescription>
              Search blocks and patterns by title or keyword and press Enter to
              insert.
            </DialogDescription>
          </DialogHeader>
          <SlashMenuPanel
            items={items}
            query={query}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onDismiss={() => setOpen(false)}
            blocks={registry}
            patterns={patternRegistry}
          />
        </DialogContent>
      </Dialog>
      {starterState.open ? (
        <StarterModal
          candidates={starterCandidates}
          blocks={registry}
          patterns={patternRegistry}
          onSelect={handleStarterSelect}
          onDismiss={starterState.dismiss}
        />
      ) : null}
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

  const identity = useMemo(() => {
    if (!selectedItem) return undefined;
    const spec = registry.get(selectedItem.type);
    if (!spec) return undefined;
    return deriveBlockIdentity(
      spec,
      selectedItem.props as Record<string, unknown>,
    );
  }, [selectedItem, registry]);

  return (
    <BlockActionsPanel
      specName={selectedItem?.type}
      registry={registry}
      identity={identity}
      onTransform={handleTransform}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onCopyJson={handleCopyJson}
    />
  );
}
