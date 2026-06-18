import type { MessageDescriptor } from "plumix/i18n";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

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

// Plain descriptor literals — the plugin package builds with plain
// `tsc`, no Lingui macro pass, so we author the `{ id, message }`
// shape directly. Resolved at the consume site via `useLingui()._()`.
const M = {
  tabEdit: {
    id: "plugin.menu.shell.tab.edit",
    message: "Edit Menus",
  },
  tabLocations: {
    id: "plugin.menu.shell.tab.locations",
    message: "Manage Locations",
  },
  createPrompt: {
    id: "plugin.menu.shell.createPrompt",
    message: "Menu name",
  },
  unassigned: {
    id: "plugin.menu.shell.unassigned",
    message: "— Unassigned —",
  },
} satisfies Record<string, MessageDescriptor>;

const TABS: readonly {
  readonly id: TabId;
  readonly label: MessageDescriptor;
}[] = [
  { id: "edit", label: M.tabEdit },
  { id: "locations", label: M.tabLocations },
];

export function MenusShell(): ReactNode {
  const { i18n } = useLingui();
  const menus = useMenuList();
  const createMenu = useCreateMenu();
  const [tab, setTab] = useState<TabId>(getSelectedTab());
  const [slug, setSlug] = useState<string | null>(getSelectedMenuSlug());

  function handleCreate(): void {
    const name = window.prompt(i18n._(M.createPrompt))?.trim();
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
    <div data-testid="menus-shell" className="flex flex-col gap-4">
      <h1 data-testid="menus-heading" className="text-2xl font-semibold">
        <Trans id="plugin.menu.shell.heading" message="Menus" />
      </h1>
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
        <div
          data-testid="menus-empty-cta"
          className="text-muted-foreground text-sm"
        >
          <Trans
            id="plugin.menu.shell.emptyState"
            message="No menus yet. Create your first menu to get started."
          />
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
    <div
      data-testid="menus-selector"
      className="flex flex-wrap items-center gap-2"
    >
      {menus.map((menu) => (
        <Button
          key={menu.id}
          type="button"
          variant="outline"
          size="sm"
          data-testid={`menus-selector-option-${menu.slug}`}
          onClick={() => {
            onSelect(menu.slug);
          }}
        >
          {menu.name}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        data-testid="menus-selector-create-new"
        onClick={onCreate}
      >
        <Trans
          id="plugin.menu.shell.createButton"
          message="+ Create new menu"
        />
      </Button>
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
  const { i18n } = useLingui();
  return (
    <div
      data-testid="menus-tabs"
      className="border-border flex items-center gap-1 border-b"
    >
      {TABS.map((entry) => (
        <Button
          key={entry.id}
          type="button"
          variant={activeTab === entry.id ? "secondary" : "ghost"}
          size="sm"
          data-testid={`menus-tab-${entry.id}`}
          aria-selected={activeTab === entry.id}
          onClick={() => {
            onChange(entry.id);
          }}
        >
          {i18n._(entry.label)}
        </Button>
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
        <p
          data-testid="menus-edit-no-selection"
          className="text-muted-foreground text-sm"
        >
          <Trans
            id="plugin.menu.shell.editEmpty"
            message="Select a menu to start editing."
          />
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
    <div
      data-testid="menus-tab-locations-panel"
      className="flex flex-col gap-2"
    >
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
  const { i18n } = useLingui();
  return (
    <div
      data-testid={`menus-location-row-${row.id}`}
      className="border-border bg-card flex items-center justify-between gap-2 rounded-md border px-3 py-2"
    >
      <span
        data-testid={`menus-location-label-${row.id}`}
        className="text-sm font-medium"
      >
        {row.label}
      </span>
      <select
        data-testid={`menus-location-select-${row.id}`}
        value={currentSlug}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "" ? null : value);
        }}
        className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value="">{i18n._(M.unassigned)}</option>
        {menus.map((menu) => (
          <option key={menu.id} value={menu.slug}>
            {menu.name}
          </option>
        ))}
      </select>
    </div>
  );
}
