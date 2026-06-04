import type { HookRegistry } from "../hooks/registry.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";
import { barMessages } from "./i18n.js";

const SITE_POSITION = 10;
const EDIT_THIS_POSITION = 20;
const NEW_GROUP_POSITION = 15;
const ACCOUNT_POSITION = 10;

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
  for (const [slug] of ctx.entryTypes) {
    additions.push({
      id: `+new:${slug}`,
      title: slug,
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
  return [
    ...nodes,
    {
      id: "account",
      title: ctx.user.email,
      href: "/_plumix/admin/profile",
      group: "account",
      position: ACCOUNT_POSITION,
    },
  ];
}
