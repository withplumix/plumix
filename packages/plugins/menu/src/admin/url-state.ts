// State lives in query params, not `:param` paths `registerAdminPage` can't
// take, and uses `history.replaceState` to keep the upstream router out.

export type TabId = "edit" | "locations";

export function setSelectedMenu(slug: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("menu", slug);
  window.history.replaceState({}, "", url);
}

/** `edit` is the default tab, so it leaves no `?tab=` behind. */
export function withSelectedTab(url: string, tab: TabId): string {
  const next = new URL(url);
  if (tab === "edit") next.searchParams.delete("tab");
  else next.searchParams.set("tab", tab);
  return next.href;
}

export function getSelectedTab(search: string): TabId {
  const value = new URLSearchParams(search).get("tab");
  return value === "locations" ? "locations" : "edit";
}

export function getSelectedMenuSlug(): string | null {
  return new URL(window.location.href).searchParams.get("menu");
}
