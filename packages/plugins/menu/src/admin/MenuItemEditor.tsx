import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import type { MessageDescriptor } from "plumix/i18n";
import type { CSSProperties, Dispatch, ReactNode } from "react";
import { useEffect, useReducer, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  buttonVariants,
  Checkbox,
  destructiveGhostClassName,
  Input,
} from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

import type {
  EditorAction,
  EditorItem,
  EditorState,
  ItemKey,
} from "./editor-state.js";
import type { PickerTab } from "./rpc.js";
import {
  buildSavePayload,
  computeDepths,
  editorReducer,
  initialEditorState,
} from "./editor-state.js";
import {
  useAssignLocation,
  useDeleteMenu,
  useLocationsList,
  useMenuGet,
  usePickerTabs,
  useSaveMenu,
} from "./rpc.js";
import { dragEndToAction, getProjection } from "./tree-state.js";

const INDENTATION_WIDTH = 24;

// Descriptors that need runtime indirection — used outside JSX (aria
// strings, window.confirm text) or inside attributes. JSX-text strings
// stay inline at their <Trans> callsite for extraction discoverability.
const M = {
  brokenLinkAria: {
    id: "plugin.menu.itemEditor.brokenLinkAria",
    message: "broken link",
  },
  reorderItemAria: {
    id: "plugin.menu.itemEditor.reorderAria",
    message: "Reorder {title}",
    comment: "title: the item's display title, or a translated 'item' fallback",
  },
  reorderFallbackTitle: {
    id: "plugin.menu.itemEditor.reorderFallbackTitle",
    message: "item",
  },
  relinkBanner: {
    id: "plugin.menu.itemEditor.relinkBanner",
    message: "Pick replacement for {label}",
    comment: "label: the broken item's resolved-label or original title",
  },
} satisfies Record<string, MessageDescriptor>;

export function MenuItemEditor({
  termId,
}: {
  readonly termId: number;
}): ReactNode {
  const menu = useMenuGet(termId);
  const pickerTabs = usePickerTabs();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  useEffect(() => {
    if (!menu.data) return;
    // Reload either when the user switches menus (term id changes) or
    // when the server's version moves past the editor's — the latter
    // is how the conflict-reload action makes its way into local state.
    // applySaveResult bumps state.version to the new server value, so
    // the matching case stays a no-op after a clean save.
    if (menu.data.id !== state.termId || menu.data.version !== state.version) {
      dispatch({ type: "loadFromServer", response: menu.data });
    }
  }, [menu.data, state.termId, state.version]);

  if (menu.isLoading || state.termId !== menu.data?.id) {
    return <div data-testid="menu-item-editor-loading" />;
  }
  return (
    <div data-testid="menu-item-editor" className="flex flex-col gap-4">
      <ItemsPicker
        tabs={pickerTabs.data ?? []}
        state={state}
        dispatch={dispatch}
      />
      {state.items.length === 0 ? (
        <div
          data-testid="menu-item-list-empty"
          className="text-muted-foreground text-sm"
        >
          <Trans
            id="plugin.menu.itemEditor.emptyState"
            message="No items yet."
          />
        </div>
      ) : (
        <MenuTree state={state} dispatch={dispatch} />
      )}
      <ItemDetailPanel state={state} dispatch={dispatch} />
      <MenuSettingsPanel state={state} dispatch={dispatch} />
    </div>
  );
}

function LocationsBindings({
  termId,
  slug,
}: {
  readonly termId: number;
  readonly slug: string;
}): ReactNode {
  const locations = useLocationsList();
  const assign = useAssignLocation();
  return (
    <div data-testid="menu-settings-locations" className="flex flex-col gap-1">
      {(locations.data ?? []).map((row) => {
        const isBound = row.boundTermId === termId;
        return (
          <label
            key={row.id}
            data-testid={`menu-settings-location-row-${row.id}`}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              data-testid={`menu-settings-location-${row.id}`}
              checked={isBound}
              onCheckedChange={() => {
                assign.mutate({
                  location: row.id,
                  termSlug: isBound ? null : slug,
                });
              }}
            />
            {row.label}
          </label>
        );
      })}
    </div>
  );
}

function MenuSettingsPanel({
  state,
  dispatch,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const save = useSaveMenu();
  const queryClient = useQueryClient();
  // The conflict banner persists past the mutation's transient error
  // state (mutation goes idle on dismiss/refetch). Dismissal is keyed
  // to the data version that was active when the user dismissed —
  // after invalidateQueries lands a newer version and the reducer
  // advances `state.version`, the comparison naturally re-arms so a
  // SECOND `version_mismatch` (different racing editor) shows the
  // banner again.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const isVersionMismatch =
    save.error instanceof Error && save.error.message === "version_mismatch";
  const conflict = isVersionMismatch && dismissedAt !== state.version;
  return (
    <div
      data-testid="menu-settings-panel"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <LocationsBindings termId={state.termId} slug={state.slug} />
      <MaxDepthField state={state} dispatch={dispatch} />
      {conflict ? (
        <div
          data-testid="menu-conflict-banner"
          role="alert"
          className="text-destructive flex items-center justify-between gap-3 text-sm"
        >
          <Trans
            id="plugin.menu.itemEditor.conflictBanner"
            message="Another editor saved changes since you loaded this menu."
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="menu-conflict-reload"
            onClick={() => {
              setDismissedAt(state.version);
              save.reset();
              void queryClient.invalidateQueries({
                queryKey: ["menu", "get", state.termId] as const,
              });
            }}
          >
            <Trans
              id="plugin.menu.itemEditor.conflictReload"
              message="Reload to see latest"
            />
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="menu-save-button"
          disabled={save.isPending}
          onClick={() => {
            // Snapshot the keys at click time so onSuccess can reattach
            // ids to the right items even if the user mutated state
            // while the save was in flight.
            const snapshotKeys = state.items.map((item) => item.key);
            save.mutate(
              {
                termId: state.termId,
                version: state.version,
                maxDepth: state.maxDepth,
                items: buildSavePayload(state),
              },
              {
                onSuccess: (result) => {
                  dispatch({
                    type: "applySaveResult",
                    result: {
                      version: result.version,
                      itemIds: result.itemIds,
                      snapshotKeys,
                    },
                  });
                },
              },
            );
          }}
        >
          <Trans id="plugin.menu.itemEditor.saveButton" message="Save menu" />
        </Button>
        <DeleteMenuButton termId={state.termId} />
      </div>
    </div>
  );
}

function MaxDepthField({
  state,
  dispatch,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  // A local draft buys the user a transient empty string while editing —
  // without it, controlled-input + reject-on-NaN traps the field on the
  // last valid value. The reducer is still the source of truth: when
  // state.maxDepth changes (load, undo, etc.) the draft snaps back via
  // an adjusting-state-during-render compare (React 19 idiomatic — no
  // setState-in-effect).
  const [draft, setDraft] = useState(String(state.maxDepth));
  const [lastSeen, setLastSeen] = useState(state.maxDepth);
  if (state.maxDepth !== lastSeen) {
    setLastSeen(state.maxDepth);
    setDraft(String(state.maxDepth));
  }
  // The reducer no-ops `updateMaxDepth` below the deepest-existing
  // depth. Surface that explicitly so the user can tell their value
  // didn't take — without this the input keeps showing a number that
  // never made it into state and the next save sends the old value.
  const parsed = Number.parseInt(draft, 10);
  const rejected = Number.isFinite(parsed) && parsed !== state.maxDepth;
  return (
    <label
      data-testid="menu-settings-max-depth-row"
      className="flex items-center gap-2 text-sm font-medium"
    >
      <Trans id="plugin.menu.itemEditor.maxDepthLabel" message="Max depth" />
      <Input
        type="number"
        data-testid="menu-settings-max-depth"
        min={0}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const nextParsed = Number.parseInt(next, 10);
          if (Number.isFinite(nextParsed)) {
            dispatch({ type: "updateMaxDepth", value: nextParsed });
          }
        }}
        className="w-20"
      />
      {rejected ? (
        <span
          data-testid="menu-settings-max-depth-error"
          className="text-destructive text-sm font-normal"
        >
          <Trans
            id="plugin.menu.itemEditor.maxDepthRejected"
            message="Cannot set below the current deepest item."
          />
        </span>
      ) : null}
    </label>
  );
}

function DeleteMenuButton({ termId }: { readonly termId: number }): ReactNode {
  const remove = useDeleteMenu();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          data-testid="menu-delete-button"
          disabled={remove.isPending}
        >
          <Trans
            id="plugin.menu.itemEditor.deleteButton"
            message="Delete menu"
          />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="menu-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans
              id="plugin.menu.itemEditor.deleteConfirm"
              message="Delete this menu?"
            />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              id="plugin.menu.itemEditor.deleteDescription"
              message="This permanently removes the menu and its items. This can't be undone."
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="menu-delete-cancel">
            <Trans id="plugin.menu.itemEditor.deleteCancel" message="Cancel" />
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="menu-delete-confirm"
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => {
              remove.mutate({ termId });
            }}
          >
            <Trans
              id="plugin.menu.itemEditor.deleteButton"
              message="Delete menu"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ItemsPicker({
  tabs,
  state,
  dispatch,
}: {
  readonly tabs: readonly PickerTab[];
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const { i18n } = useLingui();
  // Tab identity is `kind + target`: entry/term contribute one tab per
  // type/taxonomy (all sharing `kind`), so keying the active tab on
  // `kind` alone collapses every entry tab into one and makes them all
  // read as selected. The composite keeps each tab independently
  // selectable.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const activeKind =
    activeTab === null
      ? null
      : (tabs.find((tab) => tabKey(tab) === activeTab)?.kind ?? null);
  const relinkTarget =
    state.relinkTargetKey === null
      ? null
      : (state.items.find((item) => item.key === state.relinkTargetKey) ??
        null);
  return (
    <div data-testid="menu-items-picker" className="flex flex-col gap-3">
      {relinkTarget !== null ? (
        <div
          data-testid="menu-picker-relink-banner"
          className="border-border bg-card flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span>
            {i18n._(
              M.relinkBanner.id,
              { label: relinkTarget.resolvedLabel },
              { message: M.relinkBanner.message },
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="menu-picker-relink-cancel"
            onClick={() => {
              dispatch({ type: "cancelRelink" });
            }}
          >
            <Trans id="plugin.menu.itemEditor.cancelButton" message="Cancel" />
          </Button>
        </div>
      ) : null}
      <div
        data-testid="menu-picker-tabs"
        className="border-border flex items-center gap-1 border-b"
      >
        {tabs.map((tab) => {
          const key = tabKey(tab);
          return (
            <Button
              key={key}
              type="button"
              variant={activeTab === key ? "secondary" : "ghost"}
              size="sm"
              data-testid={`menu-picker-tab-${key}`}
              aria-selected={activeTab === key}
              onClick={() => {
                setActiveTab(key);
              }}
            >
              {tab.tabLabel}
            </Button>
          );
        })}
      </div>
      {activeKind === "custom" ? (
        <CustomUrlPickerPanel
          relinkTargetKey={state.relinkTargetKey}
          dispatch={dispatch}
        />
      ) : activeKind !== null ? (
        // Entry/term/other sources have no in-admin search picker yet —
        // the lookup-search RPC that would back them isn't built. Show a
        // panel so the tab visibly responds, and point at Custom URL,
        // which can link to anything the other sources would.
        <div
          data-testid="menu-picker-unsupported-panel"
          className="border-border bg-card text-muted-foreground rounded-lg border p-4 text-sm"
        >
          <Trans
            id="plugin.menu.itemEditor.sourceUnavailable"
            message="This source isn't available yet — add the link via Custom URL."
          />
        </div>
      ) : null}
    </div>
  );
}

// Stable per-tab identity. `custom` has no `target`, so its key is just
// `custom` — keeping the existing `menu-picker-tab-custom` testid.
function tabKey(tab: PickerTab): string {
  return tab.target === undefined ? tab.kind : `${tab.kind}-${tab.target}`;
}

function CustomUrlPickerPanel({
  relinkTargetKey,
  dispatch,
}: {
  readonly relinkTargetKey: ItemKey | null;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const isRelink = relinkTargetKey !== null;
  return (
    <div
      data-testid="menu-picker-custom-panel"
      className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border p-4"
    >
      <Input
        type="text"
        data-testid="menu-picker-custom-url"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
        }}
        // `flex-1` constrains the shared Input's default `w-full` so the url,
        // label, and Add button stay on one row instead of each wrapping.
        className="flex-1"
      />
      <Input
        type="text"
        data-testid="menu-picker-custom-label"
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
        className="flex-1"
      />
      <Button
        type="button"
        size="sm"
        data-testid="menu-picker-custom-add"
        onClick={() => {
          if (url.trim() === "") return;
          if (relinkTargetKey !== null) {
            dispatch({
              type: "relinkItem",
              key: relinkTargetKey,
              newMeta: { kind: "custom", url: url.trim() },
            });
          } else {
            dispatch({
              type: "addItem",
              title: label.trim() === "" ? null : label.trim(),
              meta: { kind: "custom", url: url.trim() },
            });
          }
          setUrl("");
          setLabel("");
        }}
      >
        {isRelink ? (
          <Trans
            id="plugin.menu.itemEditor.customReplaceButton"
            message="Replace link"
          />
        ) : (
          <Trans
            id="plugin.menu.itemEditor.customAddButton"
            message="Add to menu"
          />
        )}
      </Button>
    </div>
  );
}

function MenuTree({
  state,
  dispatch,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const sensors = useSensors(
    // A small distance unblocks plain clicks (selectItem) without
    // accidentally entering a drag the moment the user puts their
    // finger down on a row.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [activeKey, setActiveKey] = useState<ItemKey | null>(null);
  const [overKey, setOverKey] = useState<ItemKey | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const projection =
    activeKey !== null && overKey !== null
      ? getProjection(
          state.items,
          activeKey,
          overKey,
          dragOffsetX,
          INDENTATION_WIDTH,
          state.maxDepth,
        )
      : null;

  const depths = computeDepths(state.items);
  const itemKeys = state.items.map((item) => item.key);

  function reset(): void {
    setActiveKey(null);
    setOverKey(null);
    setDragOffsetX(0);
  }

  function handleDragMove(event: DragMoveEvent): void {
    setDragOffsetX(event.delta.x);
    setOverKey(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const targetActive = String(event.active.id);
    const targetOver = event.over ? String(event.over.id) : null;
    if (targetOver !== null) {
      // Pull the offset from the event rather than React state — handlers
      // share a render closure and the latest setDragOffsetX may not be
      // committed by the time onDragEnd fires.
      const action = dragEndToAction(
        state.items,
        targetActive,
        targetOver,
        event.delta.x,
        INDENTATION_WIDTH,
        state.maxDepth,
      );
      if (action) dispatch(action);
    }
    reset();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => {
        setActiveKey(String(event.active.id));
      }}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
        <div data-testid="menu-tree" className="flex flex-col gap-1">
          {state.items.map((item) => (
            <SortableTreeRow
              key={item.key}
              item={item}
              depth={
                projection !== null && item.key === activeKey
                  ? projection.depth
                  : (depths.get(item.key) ?? 0)
              }
              selected={state.selectedKey === item.key}
              dispatch={dispatch}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTreeRow({
  item,
  depth,
  selected,
  dispatch,
}: {
  readonly item: EditorItem;
  readonly depth: number;
  readonly selected: boolean;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const { i18n } = useLingui();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.key });
  const id = item.id ?? item.key;
  const isBroken = item.state === "broken";
  const isUnauthorized = item.state === "unauthorized";
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // `paddingInlineStart` flips with `<html dir>` so the tree indent
    // reads correctly in RTL admin (Arabic indent reverses).
    paddingInlineStart: `${String(depth * INDENTATION_WIDTH)}px`,
    opacity: isUnauthorized ? 0.5 : undefined,
  };
  const displayLabel = item.title ?? item.resolvedLabel;
  const reorderTitle = item.title ?? i18n._(M.reorderFallbackTitle);
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`menu-item-row-${String(id)}`}
      data-depth={String(depth)}
      data-selected={selected ? "true" : "false"}
      data-state={item.state}
      onClick={() => {
        dispatch({ type: "selectItem", key: item.key });
      }}
      className={`border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 ${
        selected ? "outline-primary outline-2 outline-offset-1" : ""
      }`}
    >
      <button
        type="button"
        data-testid={`menu-item-drag-${String(id)}`}
        aria-label={i18n._(
          M.reorderItemAria.id,
          { title: reorderTitle },
          { message: M.reorderItemAria.message },
        )}
        disabled={isUnauthorized}
        // dnd-kit's listeners attach pointerdown handlers; omitting
        // them when unauthorized prevents drag activation on a row
        // the viewer can't act on.
        {...(isUnauthorized ? {} : attributes)}
        {...(isUnauthorized ? {} : listeners)}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="text-muted-foreground hover:bg-muted cursor-grab rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
      >
        ⋮⋮
      </button>
      {isBroken ? (
        <span
          data-testid={`menu-item-warning-${String(id)}`}
          aria-label={i18n._(M.brokenLinkAria)}
          className="text-destructive"
        >
          ⚠
        </span>
      ) : null}
      <span className="flex-1 truncate text-sm font-medium">
        {displayLabel}
      </span>
      {isBroken ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid={`menu-item-relink-${String(id)}`}
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type: "startRelink", key: item.key });
            }}
          >
            <Trans
              id="plugin.menu.itemEditor.relinkButton"
              message="Re-link…"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid={`menu-item-convert-${String(id)}`}
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type: "convertToCustom", key: item.key });
            }}
          >
            <Trans
              id="plugin.menu.itemEditor.convertButton"
              message="Convert to Custom URL"
            />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-testid={`menu-item-remove-${String(id)}`}
        disabled={isUnauthorized}
        className={destructiveGhostClassName}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "removeItem", key: item.key });
        }}
      >
        <Trans id="plugin.menu.itemEditor.removeButton" message="Remove" />
      </Button>
    </div>
  );
}

function ItemDetailPanel({
  state,
  dispatch,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const selected =
    state.selectedKey === null
      ? null
      : (state.items.find((item) => item.key === state.selectedKey) ?? null);
  if (!selected) return <div data-testid="menu-item-detail-empty" />;
  return (
    <div
      data-testid="menu-item-detail-panel"
      className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4"
    >
      <Input
        type="text"
        data-testid="menu-item-detail-title"
        value={selected.title ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          dispatch({
            type: "updateField",
            key: selected.key,
            patch: { title: next === "" ? null : next },
          });
        }}
      />
    </div>
  );
}
