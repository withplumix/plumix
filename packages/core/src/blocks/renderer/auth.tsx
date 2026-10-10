import type { ReactNode } from "react";

import { useUser } from "./context.js";

/** Reads the same request user as {@link useUser}. */
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
