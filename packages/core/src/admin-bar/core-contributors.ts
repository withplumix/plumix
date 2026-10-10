import type { HookRegistry } from "../hooks/registry.js";
import type { RegisteredEntryType } from "../plugin/manifest.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";
import { entryCapabilityByName } from "../access/contract/entry-capabilities.js";
import { labelSourceText } from "../i18n/label.js";
import { deriveAdminSlug } from "../plugin/manifest.js";
import { barMessages } from "./i18n.js";

const SITE_POSITION = 10;
const EDIT_THIS_POSITION = 20;
const NEW_GROUP_POSITION = 15;
// Sorts last so `margin-inline-start: auto` parks the account at the far
// right with nothing trailing it — site / +New / Edit cluster on the left.
const ACCOUNT_POSITION = 100;

/**
 * Priorities 10–30 stay under the plugin default of 100, so plugins see core's
 * contributions in their input.
 */
export function registerCoreAdminBarContributors(hooks: HookRegistry): void {
  hooks.addFilter("admin_bar:nodes", siteContributor, {
    plugin: "core",
    priority: 10,
  });
  hooks.addFilter("admin_bar:nodes", editThisContributor, {
    plugin: "core",
    priority: 20,
  });
  hooks.addFilter("admin_bar:nodes", newGroupContributor, {
    plugin: "core",
    priority: 25,
  });
  hooks.addFilter("admin_bar:nodes", accountContributor, {
    plugin: "core",
    priority: 30,
  });
}

function siteContributor(
  nodes: readonly AdminBarNode[],
  bar: BarRenderContext,
): readonly AdminBarNode[] {
  const fallback = barMessages(bar.locale).siteFallback;
  return [
    ...nodes,
    {
      id: "site",
      title: bar.siteName || fallback,
      href: "/_plumix/admin",
      group: "root",
      position: SITE_POSITION,
    },
  ];
}

function editThisContributor(
  nodes: readonly AdminBarNode[],
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  if (ctx.queriedEntry?.kind !== "entry") return nodes;
  const details = ctx.queriedEntryDetails;
  if (!details?.canEdit) return nodes;
  // Admin routes key on `adminSlug` (`posts`), not the type name (`post`),
  // which would land on a 404 list route.
  const adminSlug = adminSlugForType(
    details.type,
    ctx.entryTypes.get(details.type),
  );
  return [
    ...nodes,
    {
      id: "edit-this",
      title: barMessages(ctx.locale).edit,
      href: `/_plumix/admin/entries/${adminSlug}/${ctx.queriedEntry.id}/edit`,
      group: "primary",
      position: EDIT_THIS_POSITION,
    },
  ];
}

function newGroupContributor(
  nodes: readonly AdminBarNode[],
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  const children: AdminBarNode[] = [];
  let childPosition = 10;
  for (const [name, type] of ctx.entryTypes) {
    // Private types (e.g. `menu_item`) are managed through their own admin
    // surface, never quick-created from the bar — mirror their `showUI`
    // visibility so they don't leak into the +New menu.
    if (!type.showUI) continue;
    // Only what the viewer may create; the admin's create route would
    // refuse the rest.
    if (!ctx.auth.can(entryCapabilityByName(ctx, name, "create"))) continue;
    children.push({
      id: `+new:${name}`,
      // The type's human singular label, not the raw slug. Source-locale
      // text only (like other SSR label sites — see `route/resolve.ts`):
      // the bar has no per-plugin i18n catalog to resolve descriptors.
      title: labelSourceText(type.labels?.singular ?? type.label),
      // Route slug is the derived `adminSlug`, never the type name.
      href: `/_plumix/admin/entries/${adminSlugForType(name, type)}/create`,
      group: "+new",
      parent: "+new",
      position: childPosition,
    });
    childPosition += 10;
  }
  if (children.length === 0) return nodes;
  return [
    ...nodes,
    {
      id: "+new",
      title: barMessages(ctx.locale).newGroup,
      group: "+new",
      position: NEW_GROUP_POSITION,
    },
    ...children,
  ];
}

// Falls back to pluralizing the name when the type is absent.
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

function accountContributor(
  nodes: readonly AdminBarNode[],
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  const strings = barMessages(ctx.locale);
  // WP-style "Howdy, {display name}" — fall back to the email when the user
  // never set a name. Also seeds the mobile avatar initial. Mirrors the
  // display-name derivation in `rpc/procedures/user/lookup.ts`.
  const name = ctx.user.name?.trim();
  return [
    ...nodes,
    {
      id: "account",
      title: name !== undefined && name !== "" ? name : ctx.user.email,
      group: "account",
      position: ACCOUNT_POSITION,
    },
    {
      id: "account:profile",
      title: strings.profile,
      href: "/_plumix/admin/profile",
      group: "account",
      parent: "account",
      position: 10,
    },
    {
      id: "account:signout",
      title: strings.signOut,
      action: "signout",
      group: "account",
      parent: "account",
      position: 20,
    },
  ];
}
