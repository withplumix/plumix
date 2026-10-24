import type {
  BarRenderContext,
  CoreAdminBarNodeOptions,
} from "../plugin/admin-bar-node.js";
import type {
  MutablePluginRegistry,
  RegisteredEntryType,
} from "../plugin/manifest.js";
import { entryCapabilityByName } from "../access/contract/entry-capabilities.js";
import { labelSourceText } from "../i18n/label.js";
import { DuplicateRegistrationError } from "../plugin/errors.js";
import { deriveAdminSlug } from "../plugin/manifest.js";
import { userDisplayName } from "../users/display-name.js";
import { barMessages } from "./i18n.js";

const SITE_POSITION = 10;
const EDIT_THIS_POSITION = 20;
const NEW_GROUP_POSITION = 15;
/**
 * Sorts last so `margin-inline-start: auto` parks the account at the far
 * right with nothing trailing it — site / +New / Edit cluster on the left.
 */
const ACCOUNT_POSITION = 100;

/**
 * Called before plugins install, so a plugin claiming one of these ids is told
 * core holds it.
 */
export function registerCoreAdminBarNodes(
  registry: MutablePluginRegistry,
): void {
  const nodes: readonly CoreAdminBarNodeOptions[] = [
    {
      id: "site",
      title: (bar) => bar.siteName || barMessages(bar.locale).siteFallback,
      href: () => "/_plumix/admin",
      group: "root",
      position: SITE_POSITION,
    },
    {
      id: "edit-this",
      title: (bar) => barMessages(bar.locale).edit,
      href: editThisHref,
      visible: (bar) => editThisHref(bar) !== undefined,
      group: "primary",
      position: EDIT_THIS_POSITION,
    },
    {
      id: "+new",
      title: (bar) => barMessages(bar.locale).newGroup,
      visible: (bar) =>
        [...bar.entryTypes].some(([name, type]) => mayCreate(bar, name, type)),
      group: "+new",
      position: NEW_GROUP_POSITION,
    },
    {
      id: "account",
      // Also seeds the mobile avatar initial.
      title: (bar) => userDisplayName(bar.user),
      group: "account",
      position: ACCOUNT_POSITION,
    },
    {
      id: "account:profile",
      title: (bar) => barMessages(bar.locale).profile,
      href: () => "/_plumix/admin/profile",
      group: "account",
      parent: "account",
      position: 10,
    },
    {
      id: "account:signout",
      title: (bar) => barMessages(bar.locale).signOut,
      action: "signout",
      group: "account",
      parent: "account",
      position: 20,
    },
  ];
  for (const node of nodes) {
    registry.adminBarNodes.set(node.id, { ...node, registeredBy: null });
  }
}

/**
 * One `+ New` child per entry type, so called once every plugin has
 * registered its types.
 */
export function registerNewEntryAdminBarNodes(
  registry: MutablePluginRegistry,
): void {
  let position = 10;
  for (const [name, type] of registry.entryTypes) {
    // Private types (e.g. `menu_item`) are managed through their own admin
    // surface, never quick-created from the bar.
    if (!type.showUI) continue;
    const id = `+new:${name}`;
    // Only a plugin can hold the id by now, and core owns `+new:<type>`, so
    // the plugin is the one told it took core's node.
    const holder = registry.adminBarNodes.get(id)?.registeredBy;
    if (holder) {
      throw DuplicateRegistrationError.alreadyRegistered({
        kind: "admin bar node",
        identifier: id,
        pluginId: holder,
        previousOwner: null,
      });
    }
    registry.adminBarNodes.set(id, {
      id,
      // Source-locale text only: the bar has no per-plugin i18n catalog to
      // resolve a label descriptor.
      title: labelSourceText(type.labels?.singular ?? type.label),
      href: () =>
        `/_plumix/admin/entries/${adminSlugForType(name, type)}/create`,
      visible: (bar) => mayCreate(bar, name, type),
      group: "+new",
      parent: "+new",
      position,
      registeredBy: null,
    });
    position += 10;
  }
}

/**
 * Only what the viewer may create; the admin's create route would refuse the
 * rest.
 */
function mayCreate(
  bar: BarRenderContext,
  name: string,
  type: RegisteredEntryType,
): boolean {
  return (
    type.showUI && bar.auth.can(entryCapabilityByName(bar, name, "create"))
  );
}

function editThisHref(bar: BarRenderContext): string | undefined {
  if (bar.queriedEntry?.kind !== "entry") return undefined;
  const details = bar.queriedEntryDetails;
  if (!details?.canEdit) return undefined;
  // Admin routes key on `adminSlug` (`posts`), not the type name (`post`),
  // which would land on a 404 list route.
  const adminSlug = adminSlugForType(
    details.type,
    bar.entryTypes.get(details.type),
  );
  return `/_plumix/admin/entries/${adminSlug}/${bar.queriedEntry.id}/edit`;
}

/** Falls back to pluralizing the name when the type is absent. */
function adminSlugForType(
  name: string,
  type: RegisteredEntryType | undefined,
): string {
  const plural = type?.labels?.plural;
  return deriveAdminSlug(
    name,
    plural !== undefined ? labelSourceText(plural) : undefined,
  );
}
