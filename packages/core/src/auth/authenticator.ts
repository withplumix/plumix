import type { AppContext } from "../context/app-context.js";
import type {
  AuthResult,
  RequestAuthenticator,
} from "../context/authenticator.js";
import type { SessionPolicy } from "./contract/sessions.js";
import { startingMeta } from "../plugin/fields/starting-meta.js";
import { listUserMetaFields } from "../plugin/manifest.js";
import { validateApiToken } from "./api-tokens.js";
import { readSessionCookie } from "./cookies.js";
import { DEFAULT_SESSION_POLICY, validateSession } from "./sessions.js";

export type {
  AuthenticateScope,
  AuthResult,
  RequestAuthenticator,
} from "../context/authenticator.js";

/**
 * Pass the same policy as `auth.sessions`: the cookie's `Max-Age` follows that
 * setting, so a mismatch makes server and browser lifetimes disagree.
 */
export function sessionAuthenticator(
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const token = readSessionCookie(request);
      if (!token) return null;
      const validated = await validateSession(db, token, policy);
      if (!validated) return null;
      return { user: validated.user, credential: "session" };
    },
    hasSession(request) {
      return readSessionCookie(request) !== null;
    },
  };
}

export function authenticateTraced(
  ctx: AppContext,
  authenticator: RequestAuthenticator,
): Promise<AuthResult | null> {
  return ctx.telemetry.span("auth", async (s) => {
    const result = await authenticator.authenticate(ctx.request, ctx.db, {
      startingUserMeta: startingMeta(listUserMetaFields(ctx.plugins)),
    });
    s.set("auth.authenticated", result !== null);
    if (result) s.set("auth.user.id", result.user.id);
    return result;
  });
}

/**
 * Any caller not holding a session, an API-token caller included, reads as
 * anonymous. Surfaces that mint a credential or session must resolve the caller
 * here.
 */
export async function authenticateSession(
  ctx: AppContext,
): Promise<AuthResult | null> {
  const result = await authenticateTraced(ctx, ctx.authenticator);
  return result?.credential === "session" ? result : null;
}

/**
 * The capability narrowing a result carries: an API token's scopes, or `null`
 * (the user's role caps verbatim) for a session.
 */
export function tokenScopesOf(result: AuthResult): readonly string[] | null {
  return result.credential === "api-token" ? result.tokenScopes : null;
}

/**
 * Falls back to the `plumix_session` cookie's presence when the authenticator
 * declares no `hasSession`.
 */
export function requestHasSession(
  authenticator: RequestAuthenticator,
  request: Request,
): boolean {
  return (
    authenticator.hasSession?.(request) ?? readSessionCookie(request) !== null
  );
}

export function apiTokenAuthenticator(): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const header = request.headers.get("authorization");
      if (!header) return null;
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match?.[1]) return null;
      const validated = await validateApiToken(db, match[1]);
      if (!validated) return null;
      return {
        user: validated.user,
        credential: "api-token",
        tokenScopes: validated.token.scopes ?? null,
      };
    },
    // Opted out of public-render auth so cross-site GETs carrying the header
    // don't bump `lastUsedAt` on every hit.
    hasSession() {
      return false;
    },
  };
}

/** First match wins, for both the user and `signOutUrl`. */
export function chainAuthenticators(
  ...authenticators: readonly RequestAuthenticator[]
): RequestAuthenticator {
  return {
    async authenticate(request, db, scope) {
      for (const auth of authenticators) {
        const result = await auth.authenticate(request, db, scope);
        if (result) return result;
      }
      return null;
    },
    hasSession(request) {
      return authenticators.some((auth) => requestHasSession(auth, request));
    },
    signOutUrl(request): string | null {
      for (const auth of authenticators) {
        const url = auth.signOutUrl?.(request) ?? null;
        if (url) return url;
      }
      return null;
    },
  };
}

/**
 * Session cookie, then API token. Use `sessionAuthenticator()` alone to turn
 * API tokens off.
 */
export function defaultAuthenticator(
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): RequestAuthenticator {
  return chainAuthenticators(
    sessionAuthenticator(policy),
    apiTokenAuthenticator(),
  );
}
