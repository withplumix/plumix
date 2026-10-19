import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import type { EditLeaseNotice } from "plumix/admin";
import type { MessageDescriptor } from "plumix/i18n";
import type { CSSProperties, Dispatch, ReactNode } from "react";
import { useEffect, useId, useReducer, useRef, useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editorLeaseMode } from "plumix/admin";
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
  Checkbox,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

import type {
  EditorAction,
  EditorItem,
  EditorState,
  ItemKey,
} from "./editor-state.js";
import type { LinkTarget, PickerTab } from "./queries.js";
import type { MenuLease } from "./use-menu-lease.js";
import {
  buildSavePayload,
  computeDepths,
  depthLimitIsStale,
  editorReducer,
  hiddenInLocations,
  initialEditorState,
  itemDisplayLabel,
  locationLabels,
  locationsBoundTo,
} from "./editor-state.js";
import {
  useAssignLocation,
  useDeleteMenu,
  useLocationsList,
  useMenuGet,
  usePickerTabs,
  useSaveMenu,
  useSearchTargets,
} from "./queries.js";
import {
  linkedTargetText,
  locationCheckbox,
  menuSaveRefusal,
  pickerChoice,
  pickerPanelFor,
  searchResultsState,
} from "./shell-state.js";
import {
  dragEndToAction,
  getProjection,
  INDENTATION_WIDTH,
} from "./tree-state.js";
import { useMenuLease } from "./use-menu-lease.js";

/**
 * Descriptors that need runtime indirection — used outside JSX (aria
 * strings, reorder labels) or inside attributes. JSX-text strings stay
 * inline at their <Trans> callsite for extraction discoverability.
 */
const M = {
  brokenLinkAria: {
    id: "plugin.menu.itemEditor.brokenLinkAria",
    message: "broken link",
  },
  reorderItemAria: {
    id: "plugin.menu.itemEditor.reorderAria",
    message: "Reorder {title}",
    comment: "title: the item's name as the tree row shows it",
  },
  relinkBanner: {
    id: "plugin.menu.itemEditor.relinkBanner",
    message: "Pick replacement for {label}",
    comment: "label: the broken item's resolved-label or original title",
  },
  searchTargets: {
    id: "plugin.menu.itemEditor.searchTargets",
    message: "Search {tabLabel}…",
    comment: "tabLabel: the picker tab's name, such as 'Posts' or 'Categories'",
  },
  untitledTarget: {
    id: "plugin.menu.itemEditor.untitledTarget",
    message: "(no title)",
  },
  depthLimit: {
    id: "plugin.menu.itemEditor.depthLimit",
    message: "Up to {count, plural, one {# level} other {# levels}}",
  },
  depthLimitSetBy: {
    id: "plugin.menu.itemEditor.depthLimitSetBy",
    message:
      "Up to {count, plural, one {# level} other {# levels}}, set by the {locations} {locationCount, plural, one {location} other {locations}}",
    comment: "locations: the names of the menu locations, joined as a list",
  },
  hiddenIn: {
    id: "plugin.menu.itemEditor.hiddenIn",
    message: "Hidden in {locations}",
    comment:
      "locations: the names of the menu locations that don't show this item, joined as a list",
  },
} satisfies Record<string, MessageDescriptor>;

export function MenuItemEditor({
  termId,
  onBack,
}: {
  readonly termId: number;
  /** Leaves the menu, from the banner of one another editor holds. */
  readonly onBack: () => void;
}): ReactNode {
  const menu = useMenuGet(termId);
  const pickerTabs = usePickerTabs();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const lease = useMenuLease(termId);
  const leaseMode = editorLeaseMode(lease.state);
  const queryClient = useQueryClient();
  // Reload the menu as the previous holder left it.
  const takeOver = useMutation({
    mutationFn: lease.takeOver,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["menu", "get", termId] }),
  });

  useEffect(() => {
    if (!menu.data) return;
    // A server etag other than the editor's is how a reload reaches local
    // state; applySaveResult adopts the save's etag, so a clean save stays a
    // no-op.
    if (menu.data.id !== state.termId || menu.data.etag !== state.etag) {
      dispatch({ type: "loadFromServer", response: menu.data });
      return;
    }
    // Assigning a location changes the limit without moving the menu's etag.
    if (
      depthLimitIsStale(
        { maxDepth: state.maxDepth, limitedBy: state.limitedBy },
        menu.data,
      )
    ) {
      dispatch({
        type: "applyDepthLimit",
        maxDepth: menu.data.maxDepth,
        limitedBy: menu.data.limitedBy,
      });
    }
  }, [menu.data, state.termId, state.etag, state.maxDepth, state.limitedBy]);

  if (
    menu.isLoading ||
    state.termId !== menu.data?.id ||
    leaseMode.mode === "loading"
  ) {
    return <div data-testid="menu-item-editor-loading" />;
  }
  return (
    <div data-testid="menu-item-editor" className="flex flex-col gap-4">
      {leaseMode.mode === "readOnly" ? (
        <MenuLeaseBanner
          notice={leaseMode.notice}
          onTakeOver={() => takeOver.mutate()}
          isTakingOver={takeOver.isPending}
          onBack={onBack}
        />
      ) : null}
      {/* A disabled fieldset disables every control in the editor at once. */}
      <fieldset
        disabled={leaseMode.mode === "readOnly"}
        className="contents"
        data-testid="menu-item-editor-fieldset"
      >
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
        <MenuSettingsPanel state={state} dispatch={dispatch} lease={lease} />
      </fieldset>
    </div>
  );
}

/** Why the editor is read-only: someone else is editing the menu. */
function MenuLeaseBanner({
  notice,
  onTakeOver,
  isTakingOver,
  onBack,
}: {
  readonly notice: EditLeaseNotice;
  readonly onTakeOver: () => void;
  readonly isTakingOver: boolean;
  readonly onBack: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  const time = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(notice.kind === "heldByOther" ? notice.since : notice.at);
  const name = <bdi>{notice.name}</bdi>;
  return (
    <div
      data-testid="menu-lease-banner"
      role="status"
      className="border-warning/30 bg-warning/10 text-warning-foreground flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2 text-sm"
    >
      {notice.kind === "heldByOther" ? (
        <span data-testid="menu-lease-held-by">
          <Trans
            id="plugin.menu.itemEditor.leaseHeldBy"
            message="{name} is editing this menu (since {time})"
            values={{ name, time }}
            comment="name: the editing user's display name or email; time: a formatted date and time"
          />
        </span>
      ) : (
        <span data-testid="menu-lease-lost">
          <Trans
            id="plugin.menu.itemEditor.leaseLost"
            message="{name} took over editing this menu at {time}. Your unsaved changes are shown here but weren't saved."
            values={{ name, time }}
            comment="name: the user who took over; time: a formatted date and time"
          />
        </span>
      )}
      <div className="ms-auto flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="menu-lease-back"
          onClick={onBack}
        >
          <Trans id="plugin.menu.itemEditor.leaseBack" message="Back" />
        </Button>
        {notice.kind === "heldByOther" ? (
          <Button
            type="button"
            size="sm"
            data-testid="menu-lease-take-over"
            onClick={onTakeOver}
            disabled={isTakingOver}
          >
            <Trans
              id="plugin.menu.itemEditor.leaseTakeOver"
              message="Take over"
            />
          </Button>
        ) : null}
      </div>
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
        const { checked, toggleTo } = locationCheckbox(
          row.boundTermId,
          termId,
          slug,
        );
        return (
          <label
            key={row.id}
            data-testid={`menu-settings-location-row-${row.id}`}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              data-testid={`menu-settings-location-${row.id}`}
              checked={checked}
              onCheckedChange={() => {
                assign.mutate({
                  location: row.id,
                  termSlug: toggleTo,
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
  lease,
}: {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly lease: MenuLease;
}): ReactNode {
  const save = useSaveMenu();
  const queryClient = useQueryClient();
  const refusal = menuSaveRefusal(save.error);
  const conflict = refusal?.kind === "conflict" ? refusal.conflict : null;
  // Only another editor's lease names its holder; this editor's own doesn't.
  const holder = lease.state.kind === "held" ? undefined : conflict?.holder;
  const holderName = holder ? <bdi>{holder.name}</bdi> : null;

  const saveFrom = (ifMatch: string): void => {
    // Snapshot the keys at click time so onSuccess can reattach
    // ids to the right items even if the user mutated state
    // while the save was in flight.
    const snapshotKeys = state.items.map((item) => item.key);
    save.mutate(
      {
        termId: state.termId,
        ifMatch,
        items: buildSavePayload(state),
      },
      {
        onSuccess: (result) => {
          dispatch({
            type: "applySaveResult",
            result: {
              etag: result.etag,
              itemIds: result.itemIds,
              snapshotKeys,
            },
          });
        },
        onError: (error) => {
          const refused = menuSaveRefusal(error);
          if (refused?.kind === "locked") lease.lose(refused.locked);
        },
      },
    );
  };

  return (
    <div
      data-testid="menu-settings-panel"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <LocationsBindings termId={state.termId} slug={state.slug} />
      <DepthLimitNote state={state} />
      {conflict ? (
        // Never retried for the editor: they pick, and their items stay.
        <div
          data-testid="menu-conflict"
          role="alert"
          className="text-destructive flex flex-col gap-2 text-sm"
        >
          <p>
            <Trans
              id="plugin.menu.itemEditor.conflict"
              message="This menu changed since you opened it. Your changes are kept here and haven't been saved."
            />
          </p>
          {holder ? (
            <p data-testid="menu-conflict-holder">
              <Trans
                id="plugin.menu.itemEditor.conflictHolder"
                message="{name} is editing it now."
                values={{ name: holderName }}
                comment="name: the editing user's display name or email"
              />
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="menu-conflict-load-theirs"
              onClick={() => {
                save.reset();
                // A newer etag reloads the editor from the saved menu.
                void queryClient.invalidateQueries({
                  queryKey: ["menu", "get", state.termId] as const,
                });
              }}
            >
              <Trans
                id="plugin.menu.itemEditor.conflictLoadTheirs"
                message="Load theirs"
              />
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="menu-conflict-keep-mine"
              disabled={save.isPending}
              onClick={() => {
                // An explicit overwrite, from where the menu is now.
                saveFrom(conflict.etag);
              }}
            >
              <Trans
                id="plugin.menu.itemEditor.conflictKeepMine"
                message="Keep mine"
              />
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="menu-save-button"
          disabled={save.isPending}
          onClick={() => {
            saveFrom(state.etag);
          }}
        >
          <Trans id="plugin.menu.itemEditor.saveButton" message="Save menu" />
        </Button>
        <DeleteMenuButton termId={state.termId} />
      </div>
    </div>
  );
}

function DepthLimitNote({ state }: { readonly state: EditorState }): ReactNode {
  const { i18n } = useLingui();
  const locations = useLocationsList();
  const labels = locationLabels(state.limitedBy, locations.data ?? []);
  const text =
    labels.length === 0
      ? i18n._(
          M.depthLimit.id,
          { count: state.maxDepth },
          { message: M.depthLimit.message },
        )
      : i18n._(
          M.depthLimitSetBy.id,
          {
            count: state.maxDepth,
            locations: new Intl.ListFormat(i18n.locale).format(labels),
            locationCount: labels.length,
          },
          { message: M.depthLimitSetBy.message },
        );
  return (
    <p
      data-testid="menu-settings-depth-limit"
      className="text-muted-foreground text-sm"
    >
      {text}
    </p>
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
            variant="destructive"
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
  // Keyed on `kind + target`: entry and term tabs share `kind`, so `kind` alone
  // would mark every entry tab selected.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const firstTab = tabs[0];
  const selectedTab =
    activeTab ?? (firstTab === undefined ? "" : tabKey(firstTab));
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
              { label: itemDisplayLabel(relinkTarget) },
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
      <Tabs value={selectedTab} onValueChange={setActiveTab}>
        <TabsList data-testid="menu-picker-tabs" variant="line">
          {tabs.map((tab) => {
            const key = tabKey(tab);
            return (
              <TabsTrigger
                key={key}
                value={key}
                data-testid={`menu-picker-tab-${key}`}
              >
                {tab.tabLabel}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tabKey(tab)} value={tabKey(tab)}>
            <PickerPanel
              tab={tab}
              relinkTargetKey={state.relinkTargetKey}
              dispatch={dispatch}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Stable per-tab identity. `custom` has no `target`, so its key is just
 * `custom` — keeping the existing `menu-picker-tab-custom` testid.
 */
function tabKey(tab: PickerTab): string {
  return tab.target === undefined ? tab.kind : `${tab.kind}-${tab.target}`;
}

function PickerPanel({
  tab,
  relinkTargetKey,
  dispatch,
}: {
  readonly tab: PickerTab;
  readonly relinkTargetKey: ItemKey | null;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const panel = pickerPanelFor(tab);
  if (panel.panel === "custom") {
    return (
      <CustomUrlPickerPanel
        relinkTargetKey={relinkTargetKey}
        dispatch={dispatch}
      />
    );
  }
  if (panel.panel === "linked") {
    return (
      <LinkedTargetPickerPanel
        kind={panel.kind}
        target={panel.target}
        tabLabel={tab.tabLabel}
        relinkTargetKey={relinkTargetKey}
        dispatch={dispatch}
      />
    );
  }
  return (
    <div
      data-testid="menu-picker-unsupported-panel"
      className="border-border bg-card text-muted-foreground rounded-lg border p-4 text-sm"
    >
      <Trans
        id="plugin.menu.itemEditor.sourceUnavailable"
        message="This source isn't available yet — add the link via Custom URL."
      />
    </div>
  );
}

function LinkedTargetPickerPanel({
  kind,
  target,
  tabLabel,
  relinkTargetKey,
  dispatch,
}: {
  readonly kind: "entry" | "term";
  readonly target: string;
  readonly tabLabel: string;
  readonly relinkTargetKey: ItemKey | null;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const { i18n } = useLingui();
  const [query, setQuery] = useState("");
  // `count` keys the announced text, so repeating an add replaces the node
  // and the live region speaks again instead of seeing no change.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearchTargets({ kind, target, query });
  const searchLabel = i18n._(
    M.searchTargets.id,
    { tabLabel },
    { message: M.searchTargets.message },
  );

  function nameOf(item: LinkTarget): string {
    return (
      item.label ??
      i18n._(M.untitledTarget.id, undefined, {
        message: M.untitledTarget.message,
      })
    );
  }

  function choose(item: LinkTarget): void {
    const { action, announcement } = pickerChoice(kind, item, relinkTargetKey);
    dispatch(action);
    const label = nameOf(item);
    setAnnouncement((previous) => ({
      text: i18n._(
        announcement.id,
        { label },
        { message: announcement.message },
      ),
      count: previous.count + 1,
    }));
    // Keep the query and the focus so several results go in a row.
    inputRef.current?.focus();
  }

  function renderResults(): ReactNode {
    const results = searchResultsState(search);
    if (results === "loading") {
      return (
        <CommandEmpty>
          <Trans id="plugin.menu.itemEditor.searchLoading" message="Loading…" />
        </CommandEmpty>
      );
    }
    if (results === "error") {
      return (
        <CommandEmpty>
          <Trans
            id="plugin.menu.itemEditor.searchFailed"
            message="Couldn't load results."
          />
        </CommandEmpty>
      );
    }
    if (results === "empty") {
      return (
        <CommandEmpty>
          <Trans
            id="plugin.menu.itemEditor.searchNoMatches"
            message="No matches"
          />
        </CommandEmpty>
      );
    }
    return (search.data?.items ?? []).map((item) => (
      <CommandItem
        key={item.id}
        value={item.id}
        data-testid={`menu-picker-option-${item.id}`}
        onSelect={() => {
          choose(item);
        }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{nameOf(item)}</span>
          {item.subtitle ? (
            <span className="text-muted-foreground text-xs">
              {item.subtitle}
            </span>
          ) : null}
        </div>
      </CommandItem>
    ));
  }

  return (
    <div
      data-testid="menu-picker-linked-panel"
      className="border-border bg-card rounded-lg border"
    >
      {/* The server filters, so cmdk's own filter stays off. */}
      <Command shouldFilter={false} label={searchLabel}>
        <CommandInput
          ref={inputRef}
          data-testid="menu-picker-search-input"
          placeholder={searchLabel}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>{renderResults()}</CommandList>
      </Command>
      <div
        role="status"
        aria-live="polite"
        data-testid="menu-picker-announcement"
        className="sr-only"
      >
        <span key={announcement.count}>{announcement.text}</span>
      </div>
    </div>
  );
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
              linkedLabel: null,
            });
          } else {
            dispatch({
              type: "addItem",
              title: label.trim() === "" ? null : label.trim(),
              meta: { kind: "custom", url: url.trim() },
              linkedLabel: null,
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
  const locations = useLocationsList();
  const hidden = hiddenInLocations(
    state.items,
    locationsBoundTo(locations.data ?? [], state.termId),
  );

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
              hiddenIn={hidden.get(item.key) ?? []}
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
  hiddenIn,
  dispatch,
}: {
  readonly item: EditorItem;
  readonly depth: number;
  readonly selected: boolean;
  /** Labels of the locations that don't render this item. */
  readonly hiddenIn: readonly string[];
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const { i18n } = useLingui();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.key });
  const id = item.id ?? item.key;
  const isBroken = item.state === "broken";
  const isUnauthorized = item.state === "unauthorized";
  const displayLabel = itemDisplayLabel(item);
  return (
    <div
      ref={setNodeRef}
      style={
        {
          "--sortable-transform": CSS.Transform.toString(transform),
          "--sortable-transition": transition,
          "--indent": `${String(depth * INDENTATION_WIDTH)}px`,
        } as CSSProperties
      }
      data-testid={`menu-item-row-${String(id)}`}
      data-depth={String(depth)}
      data-selected={selected ? "true" : "false"}
      data-state={item.state}
      onClick={() => {
        dispatch({ type: "selectItem", key: item.key });
      }}
      // `ps-*` flips with `<html dir>` so the tree indent reads correctly in
      // RTL admin (Arabic indent reverses).
      className={`plumix-sortable border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 ps-(--indent) ${
        selected ? "outline-primary outline-2 outline-offset-1" : ""
      } ${isUnauthorized ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        data-testid={`menu-item-drag-${String(id)}`}
        aria-label={i18n._(
          M.reorderItemAria.id,
          { title: displayLabel },
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
      {hiddenIn.length > 0 ? (
        <span
          data-testid={`menu-item-hidden-${String(id)}`}
          className="text-muted-foreground text-xs"
        >
          {i18n._(
            M.hiddenIn.id,
            { locations: new Intl.ListFormat(i18n.locale).format(hiddenIn) },
            { message: M.hiddenIn.message },
          )}
        </span>
      ) : null}
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
        variant="destructive-ghost"
        size="xs"
        data-testid={`menu-item-remove-${String(id)}`}
        disabled={isUnauthorized}
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
  return <ItemDetailFields item={selected} dispatch={dispatch} />;
}

function ItemDetailFields({
  item,
  dispatch,
}: {
  readonly item: EditorItem;
  readonly dispatch: Dispatch<EditorAction>;
}): ReactNode {
  const inputId = useId();
  const hintId = useId();
  const isLinked = item.meta.kind !== "custom";
  return (
    <div
      data-testid="menu-item-detail-panel"
      className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4"
    >
      <Field>
        <FieldLabel htmlFor={inputId}>
          <Trans
            id="plugin.menu.itemEditor.navigationLabel"
            message="Navigation label"
          />
        </FieldLabel>
        <Input
          id={inputId}
          type="text"
          data-testid="menu-item-detail-title"
          value={item.title ?? ""}
          placeholder={isLinked ? (item.linkedLabel ?? undefined) : undefined}
          aria-describedby={isLinked ? hintId : undefined}
          onChange={(event) => {
            const next = event.target.value;
            dispatch({
              type: "updateField",
              key: item.key,
              patch: { title: next === "" ? null : next },
            });
          }}
        />
        {isLinked ? (
          <>
            <FieldDescription id={hintId}>
              <Trans
                id="plugin.menu.itemEditor.navigationLabelHint"
                message="Leave empty to use the linked title."
              />
            </FieldDescription>
            <LinkedTargetLine item={item} />
          </>
        ) : null}
      </Field>
    </div>
  );
}

function LinkedTargetLine({ item }: { readonly item: EditorItem }): ReactNode {
  const { i18n } = useLingui();
  const text = linkedTargetText(item);
  if (text === null) return null;
  return (
    <FieldDescription data-testid="menu-item-detail-linked">
      {i18n._(text)}
    </FieldDescription>
  );
}
