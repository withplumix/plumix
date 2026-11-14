import type {
  AppContext,
  AuthenticatedAppContext,
  AuthenticatedUser,
  Credential,
} from "../context/app-context.js";
import type { AuthResult } from "../context/authenticator.js";
import type { User } from "../db/schema/users.js";
import {
  audienceTokenAuthenticator,
  authenticateTraced,
  requestHasSession,
} from "./authenticator.js";
import { withUser } from "./with-user.js";

/** Which credentials a surface accepts, and how it reads them. */
export type PrincipalPolicy =
  /** The site's configured authenticator. */
  | { readonly kind: "configured" }
  /** The configured authenticator, admitting a session only (ADR 0024). */
  | { readonly kind: "session" }
  /**
   * The configured authenticator, asked only when its `hasSession` reports a
   * session, so a cross-site GET bearing only a token never bumps `lastUsedAt`.
   */
  | { readonly kind: "session-gated" }
  /**
   * An API token alone, the one credential immune to CSRF, for a surface ahead
   * of the CSRF gate. A token bound to an audience passes only where
   * `audience` names it.
   */
  | { readonly kind: "bearer"; readonly audience: string | null };

/** The request-time projection of a user row, the same on every surface. */
export function principalOf({
  id,
  email,
  name,
  avatarUrl,
  role,
  meta,
}: User): AuthenticatedUser {
  return { id, email, name, avatarUrl, role, meta };
}

/**
 * `null` when `policy` admits no one. A context already carrying a principal
 * is never resolved again; `policy` only decides whether its credential is
 * admitted.
 */
export async function resolvePrincipal(
  ctx: AppContext,
  policy: PrincipalPolicy,
): Promise<AuthenticatedAppContext | null> {
  if (ctx.user !== null && ctx.credential !== null) {
    return admits(policy, ctx.credential)
      ? withUser(ctx, ctx.user, ctx.credential)
      : null;
  }
  if (
    policy.kind === "session-gated" &&
    !requestHasSession(ctx.authenticator, ctx.request)
  ) {
    return null;
  }
  const result = await authenticateTraced(
    ctx,
    policy.kind === "bearer"
      ? audienceTokenAuthenticator(policy.audience)
      : ctx.authenticator,
  );
  const credential = result && credentialOf(result);
  if (!result || !credential || !admits(policy, credential)) return null;
  return withUser(ctx, principalOf(result.user), credential);
}

function admits(policy: PrincipalPolicy, credential: Credential): boolean {
  switch (policy.kind) {
    case "session":
      return credential.kind === "session";
    case "bearer":
      return credential.kind === "api-token";
    default:
      return true;
  }
}

/** `null` for a result naming no kind, which an untyped authenticator omits. */
function credentialOf(result: AuthResult): Credential | null {
  switch (result.credential) {
    case "session":
      return { kind: "session" };
    case "api-token":
      return {
        kind: "api-token",
        token: result.apiToken,
        scopes: result.tokenScopes,
      };
    default:
      return null;
  }
}
