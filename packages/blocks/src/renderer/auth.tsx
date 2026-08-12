import type { ReactNode } from "react";

import { useUser } from "./context.js";

/**
 * Renders its children only when a visitor is signed in. Reads the same
 * request user the theme sees through {@link useUser}, so a user menu or
 * account link is a declarative `<SignedIn>…</SignedIn>` rather than a manual
 * `useUser()` truthiness check.
 */
export function SignedIn({
  children,
}: {
  readonly children?: ReactNode;
}): ReactNode {
  return useUser() ? <>{children}</> : null;
}

/** The complement of {@link SignedIn}: children render only when signed out. */
export function SignedOut({
  children,
}: {
  readonly children?: ReactNode;
}): ReactNode {
  return useUser() ? null : <>{children}</>;
}
