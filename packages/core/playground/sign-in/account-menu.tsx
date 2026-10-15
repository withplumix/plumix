"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { authClient } from "plumix/auth/client";

/**
 * Who is signed in, from the session the page rendered with. Signing out
 * updates it in place, with no reload.
 */
export function AccountMenu(_props: IslandProps<object>): ReactNode {
  const { user, isPending } = authClient.useSession();
  if (isPending) return null;
  if (user === null) {
    return (
      <a href="/sign-in" data-testid="account-signed-out">
        Sign in
      </a>
    );
  }
  return (
    <div>
      <span data-testid="account-email">{user.email}</span>
      <button type="button" onClick={() => void authClient.signOut()}>
        Sign out
      </button>
    </div>
  );
}
