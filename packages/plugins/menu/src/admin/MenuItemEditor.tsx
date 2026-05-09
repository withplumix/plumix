import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
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
    <div data-testid="menu-item-editor">
      <ItemsPicker tabs={pickerTabs.data ?? []} dispatch={dispatch} />
      {state.items.length === 0 ? (
        <div data-testid="menu-item-list-empty">No items yet.</div>
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
    <div data-testid="menu-settings-locations">
      {(locations.data ?? []).map((row) => {
        const isBound = row.boundTermId === termId;
        return (
          <label
            key={row.id}
            data-testid={`menu-settings-location-row-${row.id}`}
          >
            <input
              type="checkbox"
              data-testid={`menu-settings-location-${row.id}`}
              checked={isBound}
              onChange={() => {
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
  // state (mutation goes idle on dismiss/refetch). A separate flag lets
  // the user explicitly dismiss via the reload action.
  const [conflict, setConflict] = useState(false);
  const isVersionMismatch =
    save.error instanceof Error && save.error.message === "version_mismatch";
  useEffect(() => {
    if (isVersionMismatch) setConflict(true);
  }, [isVersionMismatch]);
  return (
    <div data-testid="menu-settings-panel">
      <LocationsBindings termId={state.termId} slug={state.slug} />
      <MaxDepthField state={state} dispatch={dispatch} />
      {conflict ? (
        <div data-testid="menu-conflict-banner" role="alert">
          Another editor saved changes since you loaded this menu.
          <button
            type="button"
            data-testid="menu-conflict-reload"
            onClick={() => {
              setConflict(false);
              save.reset();
              void queryClient.invalidateQueries({
                queryKey: ["menu", "get", state.termId] as const,
              });
            }}
          >
            Reload to see latest
          </button>
        </div>
      ) : null}
      <button
        type="button"
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
        Save menu
      </button>
      <DeleteMenuButton termId={state.termId} />
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
  // state.maxDepth changes (load, undo, etc.) the draft snaps back.
  const [draft, setDraft] = useState(String(state.maxDepth));
  useEffect(() => {
    setDraft(String(state.maxDepth));
  }, [state.maxDepth]);
  // The reducer no-ops `updateMaxDepth` below the deepest-existing
  // depth. Surface that explicitly so the user can tell their value
  // didn't take — without this the input keeps showing a number that
  // never made it into state and the next save sends the old value.
  const parsed = Number.parseInt(draft, 10);
  const rejected = Number.isFinite(parsed) && parsed !== state.maxDepth;
  return (
    <label data-testid="menu-settings-max-depth-row">
      Max depth
      <input
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
      />
      {rejected ? (
        <span data-testid="menu-settings-max-depth-error">
          Cannot set below the current deepest item.
        </span>
      ) : null}
    </label>
  );
}

function DeleteMenuButton({ termId }: { readonly termId: number }): ReactNode {
  const remove = useDeleteMenu();
  return (
    <button
      type="button"
      data-testid="menu-delete-button"
      disabled={remove.isPending}
      onClick={() => {
        if (
          typeof window !== "undefined" &&
          !window.confirm("Delete this menu?")
        ) {
          return;
        }
        remove.mutate({ termId });
      }}
    >
      Delete menu
    </button>
  );
}

function ItemsPicker({
  tabs,
  dispatch,
}: {
  readonly tabs: readonly PickerTab[];
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  return (
    <div data-testid="menu-items-picker">
      <div data-testid="menu-picker-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.kind + (tab.target ?? "")}
            type="button"
            data-testid={`menu-picker-tab-${tab.kind}`}
            aria-selected={activeTab === tab.kind}
            onClick={() => {
              setActiveTab(tab.kind);
            }}
          >
            {tab.tabLabel}
          </button>
        ))}
      </div>
      {activeTab === "custom" ? (
        <CustomUrlPickerPanel dispatch={dispatch} />
      ) : null}
    </div>
  );
}

function CustomUrlPickerPanel({
  dispatch,
}: {
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  return (
    <div data-testid="menu-picker-custom-panel">
      <input
        type="text"
        data-testid="menu-picker-custom-url"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
        }}
      />
      <input
        type="text"
        data-testid="menu-picker-custom-label"
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      <button
        type="button"
        data-testid="menu-picker-custom-add"
        onClick={() => {
          if (url.trim() === "") return;
          dispatch({
            type: "addItem",
            title: label.trim() === "" ? null : label.trim(),
            meta: { kind: "custom", url: url.trim() },
          });
          setUrl("");
          setLabel("");
        }}
      >
        Add to menu
      </button>
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
        <div data-testid="menu-tree">
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
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.key });
  const id = item.id ?? item.key;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${String(depth * INDENTATION_WIDTH)}px`,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`menu-item-row-${String(id)}`}
      data-depth={String(depth)}
      data-selected={selected ? "true" : "false"}
      onClick={() => {
        dispatch({ type: "selectItem", key: item.key });
      }}
    >
      <button
        type="button"
        data-testid={`menu-item-drag-${String(id)}`}
        aria-label={`Reorder ${item.title ?? "item"}`}
        {...attributes}
        {...listeners}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        ⋮⋮
      </button>
      <span>{item.title ?? "(unnamed)"}</span>
      <button
        type="button"
        data-testid={`menu-item-remove-${String(id)}`}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "removeItem", key: item.key });
        }}
      >
        Remove
      </button>
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
    <div data-testid="menu-item-detail-panel">
      <input
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
