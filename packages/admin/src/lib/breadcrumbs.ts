import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { Label } from "@plumix/core/i18n";

import {
  findEntryTypeBySlug,
  findPluginPageByPath,
  findSettingsPageByName,
  findTermTaxonomyByName,
} from "./manifest.js";

export interface Crumb {
  /**
   * A plain string is a manifest label, still a valid `Label`; both resolve via
   * `i18n._`.
   */
  readonly label: string | MessageDescriptor;
  /** ICU placeholder values threaded into `i18n._` at render time —
   *  e.g. `{ singular: "category" }` substitutes into a descriptor
   *  whose message is `Create {singular}`. Only populated when the
   *  descriptor declares placeholders; ignored otherwise. */
  readonly values?: Readonly<Record<string, string>>;
  /** Absolute admin path for non-leaf crumbs that link to a real list
   *  page. Omitted for group labels (no list route exists) and for
   *  the leaf crumb. */
  readonly to?: string;
}

const M = {
  dashboard: defineMessage({
    id: "breadcrumb.dashboard",
    message: "Dashboard",
  }),
  entries: defineMessage({ id: "breadcrumb.entries", message: "Entries" }),
  terms: defineMessage({ id: "breadcrumb.terms", message: "Terms" }),
  users: defineMessage({ id: "breadcrumb.users", message: "Users" }),
  settings: defineMessage({ id: "breadcrumb.settings", message: "Settings" }),
  profile: defineMessage({ id: "breadcrumb.profile", message: "Profile" }),
  admin: defineMessage({ id: "breadcrumb.admin", message: "Admin" }),
  create: defineMessage({ id: "breadcrumb.create", message: "Create" }),
  edit: defineMessage({ id: "breadcrumb.edit", message: "Edit" }),
  addNew: defineMessage({ id: "breadcrumb.addNew", message: "Add new" }),
  editUser: defineMessage({ id: "breadcrumb.editUser", message: "Edit user" }),
} satisfies Record<string, MessageDescriptor>;

/** Labels come from the manifest so dynamic segments match the sidebar. */
export function pathToCrumbs(pathname: string): readonly Crumb[] {
  if (pathname === "/") return [{ label: M.dashboard }];
  const parts = pathname.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) return [{ label: M.dashboard }];

  switch (parts[0]) {
    case "entries":
      return entriesCrumbs(parts);
    case "terms":
      return taxonomiesCrumbs(parts);
    case "users":
      return usersCrumbs(parts);
    case "settings":
      return settingsCrumbs(parts);
    case "profile":
      return [{ label: M.profile }];
    case "pages":
      return pluginPagesCrumbs(parts);
    default:
      return [{ label: M.admin }];
  }
}

function entriesCrumbs(parts: readonly string[]): readonly Crumb[] {
  const slug = parts[1];
  if (slug === undefined) return [{ label: M.entries }];
  const entry = findEntryTypeBySlug(slug);
  const label: Label = entry?.labels?.plural ?? entry?.label ?? slug;
  const list: Crumb = { label, to: `/entries/${slug}` };
  if (parts[2] === "create")
    return [{ label: M.entries }, list, { label: M.create }];
  if (parts[3] === "edit")
    return [{ label: M.entries }, list, { label: M.edit }];
  return [{ label: M.entries }, { ...list, to: undefined }];
}

function taxonomiesCrumbs(parts: readonly string[]): readonly Crumb[] {
  const name = parts[1];
  if (name === undefined) return [{ label: M.terms }];
  const tax = findTermTaxonomyByName(name);
  const label: Label = tax?.label ?? name;
  const list: Crumb = { label, to: `/terms/${name}` };
  // The parent crumb already carries the taxonomy's label.
  if (parts[2] === "create")
    return [{ label: M.terms }, list, { label: M.create }];
  if (parts[3] === "edit") return [{ label: M.terms }, list, { label: M.edit }];
  return [{ label: M.terms }, { ...list, to: undefined }];
}

function usersCrumbs(parts: readonly string[]): readonly Crumb[] {
  if (parts[1] === undefined) return [{ label: M.users }];
  const usersList: Crumb = { label: M.users, to: "/users" };
  if (parts[1] === "create") return [usersList, { label: M.addNew }];
  if (parts[2] === "edit") return [usersList, { label: M.editUser }];
  return [{ label: M.users }];
}

function pluginPagesCrumbs(parts: readonly string[]): readonly Crumb[] {
  // No parent crumb: "Pages > X" would collide with the "Pages" entry type.
  const path = `/${parts.join("/")}`;
  const item = findPluginPageByPath(path);
  if (item) return [{ label: item.label }];
  // Unknown plugin path — keep the URL slug as a placeholder so the
  // user doesn't see an opaque "Admin" header during a 404.
  const tail = parts[parts.length - 1];
  // Caller enters via `case "pages"` in `pathToCrumbs`, so `parts`
  // is non-empty in practice; the guard exists to satisfy
  // `noUncheckedIndexedAccess` without leaning on `!`.
  if (tail === undefined) return [{ label: M.admin }];
  return [{ label: tail }];
}

function settingsCrumbs(parts: readonly string[]): readonly Crumb[] {
  const name = parts[1];
  if (name === undefined) return [{ label: M.settings }];
  const page = findSettingsPageByName(name);
  return [
    { label: M.settings, to: "/settings" },
    { label: page?.label ?? name },
  ];
}
