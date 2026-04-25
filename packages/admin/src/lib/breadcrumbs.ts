import {
  findEntryTypeBySlug,
  findSettingsPageByName,
  findTermTaxonomyByName,
} from "./manifest.js";

/**
 * Pathname → breadcrumb trail. Resolves entry-type / taxonomy / settings
 * labels via the manifest so dynamic segments match the sidebar. Used by
 * both the shell header (visual breadcrumbs) and the document-title
 * effect on the root route.
 */
export function pathToCrumbs(pathname: string): readonly string[] {
  if (pathname === "/") return ["Dashboard"];
  const parts = pathname.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) return ["Dashboard"];

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
      return ["Profile"];
    case "pages":
      return ["Pages", ...parts.slice(1)];
    default:
      return ["Admin"];
  }
}

function entriesCrumbs(parts: readonly string[]): readonly string[] {
  const slug = parts[1];
  if (slug === undefined) return ["Entries"];
  const entry = findEntryTypeBySlug(slug);
  const label = entry?.labels?.plural ?? entry?.label ?? slug;
  if (parts[2] === "create") return ["Entries", label, "Create"];
  if (parts[3] === "edit") return ["Entries", label, "Edit"];
  return ["Entries", label];
}

function taxonomiesCrumbs(parts: readonly string[]): readonly string[] {
  const name = parts[1];
  if (name === undefined) return ["Terms"];
  const tax = findTermTaxonomyByName(name);
  const label = tax?.label ?? name;
  const singular = (tax?.labels?.singular ?? label).toLowerCase();
  if (parts[2] === "create") return ["Terms", label, `Create ${singular}`];
  if (parts[3] === "edit") return ["Terms", label, `Edit ${singular}`];
  return ["Terms", label];
}

function usersCrumbs(parts: readonly string[]): readonly string[] {
  if (parts[1] === undefined) return ["Users"];
  if (parts[1] === "create") return ["Users", "Add new"];
  if (parts[2] === "edit") return ["Users", "Edit user"];
  return ["Users"];
}

function settingsCrumbs(parts: readonly string[]): readonly string[] {
  const name = parts[1];
  if (name === undefined) return ["Settings"];
  const page = findSettingsPageByName(name);
  return ["Settings", page?.label ?? name];
}
