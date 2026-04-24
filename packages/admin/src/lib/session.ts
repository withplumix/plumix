import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { orpc } from "./orpc.js";

// Single source of truth for the auth-session query. Used by __root's
// beforeLoad probe, the _authenticated layout gate, and the login/bootstrap
// screens — invalidating this key after a login/signout fans out everywhere.
export const sessionQueryOptions = () =>
  orpc.auth.session.queryOptions({
    input: {},
    staleTime: Infinity,
  });

export const SESSION_QUERY_KEY = orpc.auth.session.queryKey({ input: {} });

/**
 * Shared auth guard for layouts that require a signed-in user. Used by
 * `_authenticated` (shell + sidebar) and `_editor` (full-screen canvas).
 * Returns the user so the caller can spread it into route context.
 * Throws a TanStack Router redirect on failure.
 */
export async function requireAuthenticatedSession(queryClient: QueryClient) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions());
  if (!session.user) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow; see https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes
    throw redirect({ to: session.needsBootstrap ? "/bootstrap" : "/login" });
  }
  return { user: session.user };
}
