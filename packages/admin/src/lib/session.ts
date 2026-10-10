import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { orpc } from "./orpc.js";

/**
 * Single source of truth for the auth-session query. Used by __root's
 * beforeLoad probe, the _authenticated layout gate, and the login/bootstrap
 * screens — invalidating this key after a login/signout fans out everywhere.
 */
export const sessionQueryOptions = () =>
  orpc.auth.session.queryOptions({
    input: {},
    staleTime: Infinity,
  });

export const SESSION_QUERY_KEY = orpc.auth.session.queryKey({ input: {} });

/**
 * `static` makes a page load fetch the session once, however many guards read
 * it.
 */
export function loadSession(queryClient: QueryClient) {
  return queryClient.query({ ...sessionQueryOptions(), staleTime: "static" });
}

/**
 * Invalidating isn't enough after sign-in: `static` keeps serving the cached
 * signed-out session.
 */
export function refetchSession(queryClient: QueryClient) {
  return queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY });
}

/** Throws a TanStack Router redirect when signed out. */
export async function requireAuthenticatedSession(queryClient: QueryClient) {
  const session = await loadSession(queryClient);
  if (!session.user) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow; see https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes
    throw redirect({ to: session.needsBootstrap ? "/bootstrap" : "/login" });
  }
  return { user: session.user };
}
