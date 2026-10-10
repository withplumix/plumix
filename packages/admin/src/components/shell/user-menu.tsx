import type { ReactNode } from "react";
import { signOut } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY } from "@/lib/session.js";
import { Trans } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";

import type { AuthSessionUser } from "@plumix/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plumix/admin-ui/dropdown-menu";
import { ChevronsUpDown, LogOut, Settings, User } from "@plumix/admin-ui/icons";
import { SidebarMenuButton, useSidebar } from "@plumix/admin-ui/sidebar";

/**
 * Only the identity fields are rendered — a narrow slice of the session
 * user so this component stays decoupled from `role` / `avatarUrl` churn,
 * while still type-linked to the auth.session contract.
 */
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
      // An external IdP's logout redirect; otherwise its credential would
      // silently re-auth the next request.
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
        <SidebarMenuButton size="lg" data-testid="user-menu-trigger">
          {/* Not an `AvatarFallback`: its muted text on the muted fill falls
              short of WCAG AA contrast at this size. */}
          <div
            aria-hidden
            className="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          >
            {initials}
          </div>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
          <ChevronsUpDown className="ms-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
          <div
            aria-hidden
            className="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 items-center justify-center rounded-md text-xs font-semibold"
          >
            {initials}
          </div>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile" data-testid="user-menu-profile-link">
              <User className="size-4" />
              <Trans id="menu.profile" message="Profile" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="size-4" />
            <Trans id="menu.settings" message="Settings" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
          data-testid="user-menu-sign-out"
        >
          <LogOut className="size-4" />
          {signOutMutation.isPending ? (
            <Trans id="menu.signOut.pending" message="Signing out…" />
          ) : (
            <Trans id="menu.signOut" message="Sign out" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
