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
import { visibleAdminNav } from "@/lib/manifest.js";
import { Link } from "@tanstack/react-router";
import {
  FileText,
  LayoutDashboard,
  Puzzle,
  Settings,
  Tag,
  Users,
} from "lucide-react";

import type { CoreIconName } from "@plumix/core/manifest";

import type { UserIdentity } from "./user-menu.js";
import { UserMenu } from "./user-menu.js";

const CORE_ICON: Record<CoreIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  content: FileText,
  tag: Tag,
  users: Users,
  settings: Settings,
  puzzle: Puzzle,
};

export function AppSidebar({
  user,
  capabilities,
}: {
  user: UserIdentity;
  capabilities: readonly string[];
}): ReactNode {
  const groups = visibleAdminNav(capabilities);
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
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.coreIcon
                    ? CORE_ICON[item.coreIcon]
                    : Puzzle;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild tooltip={item.label}>
                        <Link
                          to={item.to}
                          activeProps={{ "data-active": "true" }}
                          activeOptions={{ exact: item.exact ?? false }}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
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
