import type { HookRegistry } from "../hooks/registry.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";
import { labelSourceText } from "../i18n/label.js";
import { resolveEntryTypeVisibility } from "../plugin/manifest.js";
import { barMessages } from "./i18n.js";

const SITE_POSITION = 10;
const EDIT_THIS_POSITION = 20;
const NEW_GROUP_POSITION = 15;
// Sorts last so `margin-inline-start: auto` parks the account at the far
// right with nothing trailing it — site / +New / Edit cluster on the left.
const ACCOUNT_POSITION = 100;

/**
 * Registers the four core contributors (`site`, `edit-this`, `+new`,
 * `account`). Wired at `buildApp` time so they run before any plugin
 * filter handler.
 *
 * Filter priority levels (10/15/20/25/30) stay well under the
 * `DEFAULT_HOOK_PRIORITY` of 100 plugins land at — plugins see core's
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
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  const fallback = barMessages(ctx.locale).siteFallback;
  return [
    ...nodes,
    {
      id: "site",
      title: ctx.siteName || fallback,
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
  if (!details) return nodes;
  const ownerScope = details.authorId === ctx.user.id ? "edit_own" : "edit_any";
  const capability = `entry:${details.type}:${ownerScope}`;
  if (!ctx.auth.can(capability)) return nodes;
  return [
    ...nodes,
    {
      id: "edit-this",
      title: barMessages(ctx.locale).edit,
      href: `/_plumix/admin/entries/${details.type}/${ctx.queriedEntry.id}/edit`,
      group: "primary",
      position: EDIT_THIS_POSITION,
    },
  ];
}

function newGroupContributor(
  nodes: readonly AdminBarNode[],
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  const strings = barMessages(ctx.locale);
  const additions: AdminBarNode[] = [
    {
      id: "+new",
      title: strings.newGroup,
      group: "+new",
      position: NEW_GROUP_POSITION,
    },
  ];
  let childPosition = 10;
  for (const [slug, type] of ctx.entryTypes) {
    // Private types (e.g. `menu_item`) are managed through their own admin
    // surface, never quick-created from the bar — mirror their `showUI`
    // visibility so they don't leak into the +New menu.
    if (!resolveEntryTypeVisibility(type).showUI) continue;
    additions.push({
      id: `+new:${slug}`,
      // The type's human singular label, not the raw slug. Source-locale
      // text only (like other SSR label sites — see `route/resolve.ts`):
      // the bar has no per-plugin i18n catalog to resolve descriptors.
      title: labelSourceText(type.labels?.singular ?? type.label),
      href: `/_plumix/admin/entries/${slug}/create`,
      group: "+new",
      parent: "+new",
      position: childPosition,
    });
    childPosition += 10;
  }
  return [...nodes, ...additions];
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
