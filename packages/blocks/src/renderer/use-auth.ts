// No client directive here: the island transform shims every export of a
// directive-carrying module into a component, so a hook would stop running.
// The directive belongs on the theme component that calls this — see
// VitePluginError.islandExportIsHook.
import { useEffect, useState } from "react";

import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../csrf.js";
import { documentBasePath } from "./document-base-path.js";

// Mirrors core's `AuthSessionUser` (the `auth.session` output). `@plumix/core`
// depends on `@plumix/blocks`, not the reverse, so we restate the shape here
// rather than import it — the same reason `RendererUser` is mirrored in
// `context.tsx`.
export interface AuthUser {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly capabilities: readonly string[];
}

export interface UseAuthResult {
  /** The signed-in visitor, or `null` while loading or signed out. */
  readonly user: AuthUser | null;
  /** True until the `auth.session` probe resolves. */
  readonly loading: boolean;
}

// The oRPC `auth.session` procedure — the same whoami the admin boots from, so
// admin and theme share one source of truth. We POST the RPC envelope directly
// rather than pull in `@orpc/client`: `@plumix/blocks` cannot depend on
// `@plumix/core` (core depends on blocks) and so cannot borrow the admin's
// typed client, and `auth.session`'s output is JSON-native, so its response is
// a plain `{ json: <value> }` with no oRPC `meta` type-hints to decode. This
// keeps the theme transport dependency-free; if the procedure ever returned a
// non-plain value (a `Date`, a `bigint`), it would need the real client.
const SESSION_PATH = "/_plumix/rpc/auth/session";

interface SessionEnvelope {
  readonly json?: { readonly user?: AuthUser | null };
}

async function fetchSessionUser(signal: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch(`${documentBasePath()}${SESSION_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The dispatcher rejects any /_plumix/* mutation missing this — the
      // admin client sends it too.
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    },
    body: JSON.stringify({ json: {} }),
    signal,
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as SessionEnvelope;
  return payload.json?.user ?? null;
}

/**
 * Resolves the current visitor client-side via the existing `auth.session`
 * RPC, so a theme island (a user menu, a personalized greeting) can hydrate on
 * a page whose HTML was served from the shared edge cache. The server render is
 * cache-shared and anonymous; personalization is entirely client-side.
 *
 * Fails closed: an aborted, offline, or non-2xx probe resolves to the
 * signed-out state (`user: null`) rather than throwing, so a user menu renders
 * its logged-out affordance instead of crashing the island.
 */
export function useAuth(): UseAuthResult {
  const [state, setState] = useState<UseAuthResult>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    // `fetchSessionUser` already fails closed to `null` for a non-2xx body;
    // `.catch` folds an aborted/offline/parse rejection into the same path, so
    // the hook settles once, to a user or to signed-out — never throwing.
    void fetchSessionUser(controller.signal)
      .catch(() => null)
      .then((user) => {
        if (!controller.signal.aborted) setState({ user, loading: false });
      });
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
