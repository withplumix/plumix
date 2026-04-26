import {
  findEntryTypeBySlug,
  findPluginPageByPath,
  findSettingsPageByName,
  findTermTaxonomyByName,
} from "./manifest.js";

export interface Crumb {
  readonly label: string;
  /** Absolute admin path for non-leaf crumbs that link to a real list
   *  page. Omitted for group labels (no list route exists) and for
   *  the leaf crumb. */
  readonly to?: string;
}

/**
 * Pathname → breadcrumb trail. Resolves entry-type / taxonomy / settings
 * labels via the manifest so dynamic segments match the sidebar. Used
 * by both the shell header (visual breadcrumbs, with non-leaf crumbs
 * rendered as Links) and the document-title effect on the root route
 * (which only reads the leaf label).
 */
export function pathToCrumbs(pathname: string): readonly Crumb[] {
  if (pathname === "/") return [{ label: "Dashboard" }];
  const parts = pathname.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) return [{ label: "Dashboard" }];

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
      return [{ label: "Profile" }];
    case "pages":
      return pluginPagesCrumbs(parts);
    default:
      return [{ label: "Admin" }];
  }
}

function entriesCrumbs(parts: readonly string[]): readonly Crumb[] {
  const slug = parts[1];
  if (slug === undefined) return [{ label: "Entries" }];
  const entry = findEntryTypeBySlug(slug);
  const label = entry?.labels?.plural ?? entry?.label ?? slug;
  const list: Crumb = { label, to: `/entries/${slug}` };
  if (parts[2] === "create")
    return [{ label: "Entries" }, list, { label: "Create" }];
  if (parts[3] === "edit")
    return [{ label: "Entries" }, list, { label: "Edit" }];
  return [{ label: "Entries" }, { ...list, to: undefined }];
}

function taxonomiesCrumbs(parts: readonly string[]): readonly Crumb[] {
  const name = parts[1];
  if (name === undefined) return [{ label: "Terms" }];
  const tax = findTermTaxonomyByName(name);
  const label = tax?.label ?? name;
  const singular = (tax?.labels?.singular ?? label).toLowerCase();
  const list: Crumb = { label, to: `/terms/${name}` };
  if (parts[2] === "create")
    return [{ label: "Terms" }, list, { label: `Create ${singular}` }];
  if (parts[3] === "edit")
    return [{ label: "Terms" }, list, { label: `Edit ${singular}` }];
  return [{ label: "Terms" }, { ...list, to: undefined }];
}

function usersCrumbs(parts: readonly string[]): readonly Crumb[] {
  if (parts[1] === undefined) return [{ label: "Users" }];
  const usersList: Crumb = { label: "Users", to: "/users" };
  if (parts[1] === "create") return [usersList, { label: "Add new" }];
  if (parts[2] === "edit") return [usersList, { label: "Edit user" }];
  return [{ label: "Users" }];
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
  if (name === undefined) return [{ label: "Settings" }];
  const page = findSettingsPageByName(name);
  return [
    { label: "Settings", to: "/settings" },
    { label: page?.label ?? name },
  ];
}
