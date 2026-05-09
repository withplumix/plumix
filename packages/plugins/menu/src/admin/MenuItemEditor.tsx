import type { Dispatch, ReactNode } from "react";
import { useEffect, useReducer, useState } from "react";
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
        <MenuItemList state={state} dispatch={dispatch} />
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

function MenuItemList({
  state,
  dispatch,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const depths = computeDepths(state);
  return (
    <ol data-testid="menu-item-list">
      {state.items.map((item) => (
        <MenuItemRow
          key={item.key}
          item={item}
          depth={depths.get(item.key) ?? 0}
          selected={state.selectedKey === item.key}
          dispatch={dispatch}
        />
      ))}
    </ol>
  );
}

function MenuItemRow({
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
  const id = item.id ?? item.key;
  return (
    <li
      data-testid={`menu-item-row-${String(id)}`}
      data-depth={String(depth)}
      data-selected={selected ? "true" : "false"}
      style={{ paddingLeft: `${String(depth * 16)}px` }}
      onClick={() => {
        dispatch({ type: "selectItem", key: item.key });
      }}
    >
      <span>{item.title ?? "(unnamed)"}</span>
      <button
        type="button"
        data-testid={`menu-item-up-${String(id)}`}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "moveUp", key: item.key });
        }}
      >
        Up
      </button>
      <button
        type="button"
        data-testid={`menu-item-down-${String(id)}`}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "moveDown", key: item.key });
        }}
      >
        Down
      </button>
      <button
        type="button"
        data-testid={`menu-item-promote-${String(id)}`}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "promote", key: item.key });
        }}
      >
        Promote
      </button>
      <button
        type="button"
        data-testid={`menu-item-demote-${String(id)}`}
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "demote", key: item.key });
        }}
      >
        Demote
      </button>
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
    </li>
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

function computeDepths(state: EditorState): Map<ItemKey, number> {
  const depthByKey = new Map<ItemKey, number>();
  for (const item of state.items) {
    if (item.parentKey === null) {
      depthByKey.set(item.key, 0);
    } else {
      const parentDepth = depthByKey.get(item.parentKey) ?? 0;
      depthByKey.set(item.key, parentDepth + 1);
    }
  }
  return depthByKey;
}
