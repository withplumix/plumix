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
