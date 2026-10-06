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
 * Default authenticator — reads the `plumix_session` cookie, validates
 * the row, returns the user. Same logic the dispatcher used inline
 * before this contract existed; isolating it here makes it swappable.
 *
 * Resolves a `"session"` credential — a browser session inherits the full
 * role caps. PAT-style scoping doesn't apply here.
 *
 * Pass the same policy as `auth.sessions` when composing this yourself;
 * the cookie's `Max-Age` follows that setting, so a mismatch here leaves
 * the server enforcing a different lifetime than the browser.
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

/**
 * Run an authenticator inside an `auth` telemetry span, so session/token
 * resolution shows up in the request's span tree with its outcome. The
 * single traced entry point for every auth choke point — public render,
 * admin shell, RPC middleware, and the bearer surfaces (MCP, REST).
 */
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
 * Resolve the caller through the request's configured authenticator, but only
 * when they hold a session. An API-token caller, or a result naming any other
 * credential kind, reads as anonymous. A surface that creates a credential or
 * a session for the caller resolves them here (ADR 0024).
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
 * Whether a request carries a session this authenticator would resolve on a
 * public render. Defaults to "the standard `plumix_session` cookie is present"
 * for an authenticator that doesn't declare its own signal, preserving the historical
 * behaviour for authenticators written before this predicate existed.
 */
export function requestHasSession(
  authenticator: RequestAuthenticator,
  request: Request,
): boolean {
  return (
    authenticator.hasSession?.(request) ?? readSessionCookie(request) !== null
  );
}

/**
 * Personal-access-token authenticator. Reads the
 * `Authorization: Bearer pl_pat_…` header, hashes it, looks up the
 * row in `api_tokens`, and bumps `lastUsedAt`. Used by CLIs / MCP
 * servers / any non-browser client.
 *
 * Composed with `sessionAuthenticator()` by default (see
 * `defaultAuthenticator()`) so a single plumix install supports both
 * cookie-authed admin browsing AND bearer-authed API access without
 * any operator config.
 */
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
        // null = unrestricted (token inherits role caps); array =
        // narrow to that intersection. `auth.can()` enforces.
        tokenScopes: validated.token.scopes ?? null,
      };
    },
    // A bearer token is an API client, not a browser session: opt out of
    // public-render authentication so a cross-site GET navigation carrying an
    // Authorization header doesn't bump the token's `lastUsedAt` on every hit.
    hasSession() {
      return false;
    },
  };
}

/**
 * Compose multiple authenticators into a first-match-wins chain. The
 * first one to return a non-null user decides the request. `signOutUrl`
 * is taken from the first authenticator that returns one for the request —
 * the chain is a list, and the head wins when both could speak.
 *
 * Used to wire the default plumix install: the cookie-session authenticator
 * in front of the API-token authenticator, so browser requests resolve via
 * the existing path and bearer-auth API clients don't need any
 * operator config.
 */
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
 * Out-of-the-box authenticator: cookie-session + API token. Plumix
 * uses this when `auth.authenticator` is omitted from config; the
 * existing `sessionAuthenticator()` direct usage is preserved as the
 * intentional "no API tokens" path for ops who want to disable
 * bearer-auth at the runtime level.
 */
export function defaultAuthenticator(
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): RequestAuthenticator {
  return chainAuthenticators(
    sessionAuthenticator(policy),
    apiTokenAuthenticator(),
  );
}
