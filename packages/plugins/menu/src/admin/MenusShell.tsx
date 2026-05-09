import type { ReactNode } from "react";
import { useState } from "react";

import type { MenuListItem, MenuLocationRow } from "./rpc.js";
import type { TabId } from "./url-state.js";
import { MenuItemEditor } from "./MenuItemEditor.js";
import {
  useAssignLocation,
  useCreateMenu,
  useLocationsList,
  useMenuList,
} from "./rpc.js";
import {
  getSelectedMenuSlug,
  getSelectedTab,
  setSelectedMenu,
  setSelectedTab,
} from "./url-state.js";

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: "edit", label: "Edit Menus" },
  { id: "locations", label: "Manage Locations" },
];

export function MenusShell(): ReactNode {
  const menus = useMenuList();
  const createMenu = useCreateMenu();
  const [tab, setTab] = useState<TabId>(getSelectedTab());
  const [slug, setSlug] = useState<string | null>(getSelectedMenuSlug());

  function handleCreate(): void {
    const name = window.prompt("Menu name")?.trim();
    if (!name) return;
    createMenu.mutate(
      { name },
      {
        onSuccess: (result) => {
          setSelectedMenu(result.slug);
          setSlug(result.slug);
        },
      },
    );
  }

  function handleTabChange(next: TabId): void {
    setSelectedTab(next);
    setTab(next);
  }

  function handleSelectMenu(next: string): void {
    setSelectedMenu(next);
    setSlug(next);
  }

  if (menus.isLoading) {
    return <div data-testid="menus-shell-loading" />;
  }
  const menuList = menus.data ?? [];
  const selectedMenu =
    slug === null ? null : (menuList.find((m) => m.slug === slug) ?? null);
  return (
    <div data-testid="menus-shell">
      <MenuSelector
        menus={menuList}
        onCreate={handleCreate}
        onSelect={handleSelectMenu}
      />
      <Tabs activeTab={tab} onChange={handleTabChange} />
      {tab === "edit" ? (
        <EditPanel selectedMenu={selectedMenu} />
      ) : (
        <LocationsPanel menus={menuList} />
      )}
      {menuList.length === 0 ? (
        <div data-testid="menus-empty-cta">
          No menus yet. Create your first menu to get started.
        </div>
      ) : null}
    </div>
  );
}

function MenuSelector({
  menus,
  onCreate,
  onSelect,
}: {
  readonly menus: readonly MenuListItem[];
  readonly onCreate: () => void;
  readonly onSelect: (slug: string) => void;
}): ReactNode {
  return (
    <div data-testid="menus-selector">
      {menus.map((menu) => (
        <button
          key={menu.id}
          type="button"
          data-testid={`menus-selector-option-${menu.slug}`}
          onClick={() => {
            onSelect(menu.slug);
          }}
        >
          {menu.name}
        </button>
      ))}
      <button
        type="button"
        data-testid="menus-selector-create-new"
        onClick={onCreate}
      >
        + Create new menu
      </button>
    </div>
  );
}

function Tabs({
  activeTab,
  onChange,
}: {
  readonly activeTab: TabId;
  readonly onChange: (next: TabId) => void;
}): ReactNode {
  return (
    <div data-testid="menus-tabs">
      {TABS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-testid={`menus-tab-${entry.id}`}
          aria-selected={activeTab === entry.id}
          onClick={() => {
            onChange(entry.id);
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function EditPanel({
  selectedMenu,
}: {
  readonly selectedMenu: MenuListItem | null;
}): ReactNode {
  return (
    <div data-testid="menus-tab-edit-panel">
      {selectedMenu === null ? (
        <p data-testid="menus-edit-no-selection">
          Select a menu to start editing.
        </p>
      ) : (
        <MenuItemEditor termId={selectedMenu.id} />
      )}
    </div>
  );
}

function LocationsPanel({
  menus,
}: {
  readonly menus: readonly MenuListItem[];
}): ReactNode {
  const locations = useLocationsList();
  const assign = useAssignLocation();
  const slugFromTermId = new Map(menus.map((m) => [m.id, m.slug]));

  return (
    <div data-testid="menus-tab-locations-panel">
      {(locations.data ?? []).map((row) => (
        <LocationRow
          key={row.id}
          row={row}
          menus={menus}
          currentSlug={
            row.boundTermId === null
              ? ""
              : (slugFromTermId.get(row.boundTermId) ?? "")
          }
          onChange={(termSlug) => {
            assign.mutate({ location: row.id, termSlug });
          }}
        />
      ))}
    </div>
  );
}

function LocationRow({
  row,
  menus,
  currentSlug,
  onChange,
}: {
  readonly row: MenuLocationRow;
  readonly menus: readonly MenuListItem[];
  readonly currentSlug: string;
  readonly onChange: (termSlug: string | null) => void;
}): ReactNode {
  return (
    <div data-testid={`menus-location-row-${row.id}`}>
      <span data-testid={`menus-location-label-${row.id}`}>{row.label}</span>
      <select
        data-testid={`menus-location-select-${row.id}`}
        value={currentSlug}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "" ? null : value);
        }}
      >
        <option value="">— Unassigned —</option>
        {menus.map((menu) => (
          <option key={menu.id} value={menu.slug}>
            {menu.name}
          </option>
        ))}
      </select>
    </div>
  );
}
