import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar.js";
import { signOut } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Settings, User } from "lucide-react";

import type { AuthSessionUser } from "@plumix/core";

// Only the identity fields are rendered — a narrow slice of the session
// user so this component stays decoupled from `role` / `avatarUrl` churn,
// while still type-linked to the auth.session contract.
export type UserIdentity = Pick<AuthSessionUser, "email" | "name">;

export function UserMenu({ user }: { user: UserIdentity }): ReactNode {
  const { isMobile } = useSidebar();
  const router = useRouter();

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSettled: async (result) => {
      // Drop every cached query on sign-out: the next authed session might be
      // a different user, and permission-gated data must not leak across.
      await router.invalidate();
      router.options.context.queryClient.removeQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      // External-IdP authenticators (Cloudflare Access, SAML SP-initiated)
      // surface a redirectTo that bounces the user through the IdP's
      // logout endpoint — without it, the next request would carry the
      // IdP credential and silently re-auth. Server pre-validates the
      // URL shape; the client also re-validates inside `signOut()`.
      if (result?.redirectTo) {
        window.location.assign(result.redirectTo);
        return;
      }
      await router.navigate({ to: "/login" });
    },
  });

  const displayName = user.name ?? user.email;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <div
              aria-hidden
              className="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 items-center justify-center rounded-md text-xs font-semibold"
            >
              {initials}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile" data-testid="user-menu-profile-link">
              <User className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        >
          <LogOut className="size-4" />
          {signOutMutation.isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
