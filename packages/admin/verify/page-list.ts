import type { PluginRegistry } from "@plumix/core";
import { buildManifest, capabilitiesForRole } from "@plumix/core";

export interface AdminPage {
  /** What `--open` takes in place of the route. */
  readonly id: string;
  /** Relative to the admin's base, as the admin's router spells it. */
  readonly route: string;
  readonly capability?: string;
  readonly roles: readonly string[];
}

interface ManifestPage {
  readonly to: string;
  readonly capability?: string;
}

const DASHBOARD_ID = "dashboard";

/** What the settings routes check, and the server's gate for every `settings.*` RPC. */
const SETTINGS_CAPABILITY = "settings:manage";

/** The server's gate on the admin shell, before any page's own capability. */
const ADMIN_ACCESS = "admin:access";

function pageId(route: string): string {
  const segments = route.split("/").filter((segment) => segment !== "");
  return segments.length === 0 ? DASHBOARD_ID : segments.join("-");
}

function rolesThatOpen(
  page: ManifestPage,
  roleCapabilities: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const needed = [ADMIN_ACCESS];
  if (page.capability !== undefined) needed.push(page.capability);
  return [...roleCapabilities]
    .filter(([, capabilities]) =>
      needed.every((capability) => capabilities.includes(capability)),
    )
    .map(([role]) => role);
}

export function adminPageList(registry: PluginRegistry): readonly AdminPage[] {
  const manifest = buildManifest(registry);
  const roleCapabilities = new Map(
    manifest.roles.map((role) => [
      role.name,
      capabilitiesForRole(role.name, registry),
    ]),
  );
  const navItems = manifest.adminNav.flatMap((group) => group.items);
  const settingsPages = manifest.settingsPages.map((page) => ({
    to: `/settings/${page.name}`,
    capability: SETTINGS_CAPABILITY,
  }));
  const byRoute = new Map<string, ManifestPage>();
  for (const page of [...navItems, ...manifest.adminPages, ...settingsPages]) {
    if (!byRoute.has(page.to)) byRoute.set(page.to, page);
  }
  return [...byRoute.values()].map((page) => ({
    id: pageId(page.to),
    route: page.to,
    capability: page.capability,
    roles: rolesThatOpen(page, roleCapabilities),
  }));
}
