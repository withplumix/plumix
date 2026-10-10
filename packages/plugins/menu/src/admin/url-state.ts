// State lives in query params, not `:param` paths `registerAdminPage` can't
// take, and uses `history.replaceState` to keep the upstream router out.

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

export function getSelectedMenuSlug(): string | null {
  return new URL(window.location.href).searchParams.get("menu");
}
