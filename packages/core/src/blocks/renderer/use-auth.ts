// No client directive: the island transform shims every export into a
// component, so a hook would stop running.
import { useEffect, useState } from "react";

import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../../csrf-header.js";
import { documentBasePath } from "./document-base-path.js";

/**
 * Restates `AuthSessionUser` because `blocks/` sits below `auth/` and can't
 * import it.
 */
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

// Raw envelope, not `@orpc/client`: `blocks/` sits below `rpc/`. Safe while the
// output stays JSON-native; a `Date` would need the real client.
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
 * Client-side, so an island can personalize a page served anonymously from the
 * edge cache. Never throws: any failed probe resolves to signed out.
 */
export function useAuth(): UseAuthResult {
  const [state, setState] = useState<UseAuthResult>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
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
