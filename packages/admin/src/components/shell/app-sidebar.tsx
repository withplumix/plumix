import type { ReactNode } from "react";
import { visibleAdminNav } from "@/lib/manifest.js";
import { useLabel } from "@/lib/use-label.js";
import { Link } from "@tanstack/react-router";

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
} from "@plumix/admin-ui/sidebar";

import type { UserIdentity } from "./user-menu.js";
import { CoreIcon } from "./core-icon.js";
import { UserMenu } from "./user-menu.js";

export function AppSidebar({
  user,
  capabilities,
}: {
  user: UserIdentity;
  capabilities: readonly string[];
}): ReactNode {
  const groups = visibleAdminNav(capabilities);
  const renderLabel = useLabel();
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{renderLabel(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      tooltip={renderLabel(item.label)}
                    >
                      <Link
                        to={item.to}
                        activeProps={{ "data-active": "true" }}
                        activeOptions={{ exact: item.exact ?? false }}
                      >
                        <CoreIcon name={item.coreIcon} />
                        <span>{renderLabel(item.label)}</span>
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
