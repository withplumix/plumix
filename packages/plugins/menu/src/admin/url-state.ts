// Menu admin internal state lives in `?menu=<slug>` and `?tab=<id>`
// query params (matches WordPress's `wp-admin/nav-menus.php` model
// and dodges `:param` paths in `registerAdminPage`). Manipulated via
// `history.replaceState` so React Router upstream of the plugin
// doesn't get involved.

export type TabId = "edit" | "locations";

export function setSelectedMenu(slug: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("menu", slug);
  window.history.replaceState({}, "", url);
}

export function setSelectedTab(tab: TabId): void {
  const url = new URL(window.location.href);
  if (tab === "edit") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}

export function getSelectedTab(): TabId {
  const value = new URL(window.location.href).searchParams.get("tab");
  return value === "locations" ? "locations" : "edit";
}
