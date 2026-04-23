import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";
import { hasCap } from "@/lib/caps.js";
import {
  visibleEntryTypes,
  visibleSettingsPages,
  visibleTaxonomies,
} from "@/lib/manifest.js";
import { Link } from "@tanstack/react-router";
import { FileText, LayoutDashboard, Settings, Tag, Users } from "lucide-react";

import type { UserIdentity } from "./user-menu.js";
import { UserMenu } from "./user-menu.js";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly exact?: boolean;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

// `exact` controls TanStack Router's active-link matching; `/` must opt in
// or it'd match every route.
const OVERVIEW_GROUP: NavGroup = {
  label: "Overview",
  items: [
    {
      to: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
  ],
};

function buildContentGroup(capabilities: readonly string[]): NavGroup | null {
  const items = visibleEntryTypes(capabilities).map<NavItem>((pt) => ({
    to: `/content/${pt.adminSlug}`,
    label: pt.labels?.plural ?? pt.label,
    icon: FileText,
  }));
  if (items.length === 0) return null;
  return { label: "Content", items };
}

// Core registers no taxonomies — a bare install hides the "Taxonomies"
// group entirely. The blog plugin (Phase 12) is the first consumer;
// other plugins bring their own (product categories, doc sections, …).
function buildTaxonomyGroup(capabilities: readonly string[]): NavGroup | null {
  const items = visibleTaxonomies(capabilities).map<NavItem>((tax) => ({
    to: `/taxonomies/${tax.name}`,
    label: tax.label,
    icon: Tag,
  }));
  if (items.length === 0) return null;
  return { label: "Taxonomies", items };
}

// `user:list` gates Users (admin / editor-level); Settings appears when
// ANY settings group is visible to the caller (at minimum
// `settings:manage`, but plugins may declare tighter per-group gates).
// The group only hides entirely when the caller has no management
// surfaces at all.
function buildManagementGroup(
  capabilities: readonly string[],
): NavGroup | null {
  const items: NavItem[] = [];
  if (hasCap(capabilities, "user:list")) {
    items.push({ to: "/users", label: "Users", icon: Users });
  }
  if (visibleSettingsPages(capabilities).length > 0) {
    items.push({ to: "/settings", label: "Settings", icon: Settings });
  }
  if (items.length === 0) return null;
  return { label: "Management", items };
}

export function AppSidebar({
  user,
  capabilities,
}: {
  user: UserIdentity;
  capabilities: readonly string[];
}): ReactNode {
  const contentGroup = buildContentGroup(capabilities);
  const taxonomyGroup = buildTaxonomyGroup(capabilities);
  const managementGroup = buildManagementGroup(capabilities);
  const groups = [
    OVERVIEW_GROUP,
    ...(contentGroup ? [contentGroup] : []),
    ...(taxonomyGroup ? [taxonomyGroup] : []),
    ...(managementGroup ? [managementGroup] : []),
  ];
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div
                  aria-hidden
                  className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md font-semibold"
                >
                  P
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Plumix</span>
                  <span className="text-muted-foreground truncate text-xs">
                    Admin
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <Link
                        to={item.to}
                        activeProps={{ "data-active": "true" }}
                        activeOptions={{ exact: item.exact ?? false }}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
