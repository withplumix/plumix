---
"@plumix/blocks": minor
---

Add a `useAuth()` client hook for themes.

A theme island can now read the current visitor client-side and hydrate
personalization — a user menu, a signed-in greeting — on a page whose HTML was
served from the shared edge cache:

```tsx
import { useAuth } from "plumix/blocks/renderer";

function UserMenu() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <AccountMenu user={user} /> : <SignInLink />;
}
```

The hook POSTs to the existing `auth.session` RPC — the same whoami the admin
boots from, so there is one source of truth and no new endpoint. It fails closed:
an aborted, offline, or error response resolves to the signed-out state
(`user: null`) rather than throwing.

The islands bootstrap script now carries a `data-plumix-base-path` marker so the
hook reaches the RPC endpoint under a subdirectory mount, where a hydrated island
has no provider context to read the base path from.
