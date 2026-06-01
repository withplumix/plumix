import type { MessageDescriptor } from "@lingui/core";

import {
  findEntryTypeBySlug,
  findPluginPageByPath,
  findSettingsPageByName,
  findTermTaxonomyByName,
} from "./manifest.js";

export interface Crumb {
  /**
   * Either a `MessageDescriptor` (for chrome-owned labels like "Dashboard",
   * "Entries") or a plain string (for manifest-derived labels like an
   * entry type's plural). Slice 5/#674 widens manifest labels to descriptors
   * too — when that lands, this type can narrow to `MessageDescriptor`.
   */
  readonly label: string | MessageDescriptor;
  /** Absolute admin path for non-leaf crumbs that link to a real list
   *  page. Omitted for group labels (no list route exists) and for
   *  the leaf crumb. */
  readonly to?: string;
}

// Hand-authored descriptors; matching entries live in `locales/{en,de}.po`.
const M = {
  dashboard: { id: "breadcrumb.dashboard", message: "Dashboard" },
  entries: { id: "breadcrumb.entries", message: "Entries" },
  terms: { id: "breadcrumb.terms", message: "Terms" },
  users: { id: "breadcrumb.users", message: "Users" },
  settings: { id: "breadcrumb.settings", message: "Settings" },
  profile: { id: "breadcrumb.profile", message: "Profile" },
  admin: { id: "breadcrumb.admin", message: "Admin" },
  create: { id: "breadcrumb.create", message: "Create" },
  edit: { id: "breadcrumb.edit", message: "Edit" },
  addNew: { id: "breadcrumb.addNew", message: "Add new" },
  editUser: { id: "breadcrumb.editUser", message: "Edit user" },
} satisfies Record<string, MessageDescriptor>;

/**
 * Pathname → breadcrumb trail. Resolves entry-type / taxonomy / settings
 * labels via the manifest so dynamic segments match the sidebar. Used
 * by both the shell header (visual breadcrumbs, with non-leaf crumbs
 * rendered as Links) and the document-title effect on the root route
 * (which only reads the leaf label).
 */
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
  const label = entry?.labels?.plural ?? entry?.label ?? slug;
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
  const label = tax?.label ?? name;
  const singular = (tax?.labels?.singular ?? label).toLowerCase();
  const list: Crumb = { label, to: `/terms/${name}` };
  if (parts[2] === "create")
    return [{ label: M.terms }, list, { label: `Create ${singular}` }];
  if (parts[3] === "edit")
    return [{ label: M.terms }, list, { label: `Edit ${singular}` }];
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
  // Plugin admin pages are mounted at /pages/<plugin-path>. The leaf
  // label comes from the registered nav item (`registerAdminPage`'s
  // `label` / `title`) so the document title and breadcrumb match the
  // sidebar — not the URL slug, which would render as "media" instead
  // of "Media Library". No parent crumb: a "Pages > X" trail collides
  // with the entry-type "Pages" in the user's sidebar.
  const path = `/${parts.join("/")}`;
  const item = findPluginPageByPath(path);
  if (item) return [{ label: item.label }];
  // Unknown plugin path — keep the URL slug as a placeholder so the
  // user doesn't see an opaque "Admin" header during a 404.
  const tail = parts[parts.length - 1] ?? "Admin";
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
