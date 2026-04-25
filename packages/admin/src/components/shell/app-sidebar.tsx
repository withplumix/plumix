import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";
import { visibleAdminNav } from "@/lib/manifest.js";
import { Link } from "@tanstack/react-router";
import {
  Calendar,
  FileText,
  Folder,
  Image,
  Layout,
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
  "file-text": FileText,
  layout: Layout,
  image: Image,
  calendar: Calendar,
  tag: Tag,
  folder: Folder,
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
