import type { Db } from "../../context/app-context.js";
import type { PluginRegistry } from "../../plugin/manifest.js";
import type { AuthorizationRequest } from "./authorization-request.js";
import { now } from "../../clock.js";
import { and, eq, isNull } from "../../db/index.js";
import { apiTokens } from "../../db/schema/api_tokens.js";
import { oauthAuthorizationCodes } from "../../db/schema/oauth_authorization_codes.js";
import { oauthGrants } from "../../db/schema/oauth_grants.js";
import { oauthRefreshTokens } from "../../db/schema/oauth_refresh_tokens.js";
import { encodeBase64url } from "../../encoding.js";
import { generateToken, hashToken } from "../tokens.js";
import { resolveScope } from "./scopes.js";

const CODE_BYTES = 32;
const CODE_TTL_MS = 10 * 60_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

/** What `userId` granted `clientId`; `null` before any consent. */
export async function findOAuthGrant(
  db: Db,
  userId: number,
  clientId: string,
): Promise<{ id: number; scopes: readonly string[] } | null> {
  const row = await db
    .select({ id: oauthGrants.id, scopes: oauthGrants.scopes })
    .from(oauthGrants)
    .where(
      and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)),
    )
    .get();
  return row ?? null;
}

export function oauthGrantCovers(
  granted: readonly string[],
  requested: readonly string[],
): boolean {
  const held = new Set(granted);
  return requested.every((capability) => held.has(capability));
}

/** What `request` asks `user` for, and whether their grant to the client already holds it. */
export async function checkOAuthGrant(
  db: Db,
  plugins: PluginRegistry,
  user: { readonly id: number; readonly role: string },
  request: AuthorizationRequest,
): Promise<{ requested: readonly string[]; covered: boolean }> {
  const requested = resolveScope(request.scope, user.role, plugins);
  const granted = await findOAuthGrant(db, user.id, request.client.clientId);
  return {
    requested,
    covered: granted !== null && oauthGrantCovers(granted.scopes, requested),
  };
}

export async function saveOAuthGrant(
  db: Db,
  input: {
    readonly userId: number;
    readonly clientId: string;
    readonly scopes: readonly string[];
  },
): Promise<void> {
  await db
    .insert(oauthGrants)
    .values(input)
    .onConflictDoUpdate({
      target: [oauthGrants.userId, oauthGrants.clientId],
      set: { scopes: input.scopes },
    });
}

export async function issueAuthorizationCode(
  db: Db,
  input: {
    readonly userId: number;
    readonly request: AuthorizationRequest;
    readonly scopes: readonly string[];
  },
): Promise<string> {
  const code = encodeBase64url(
    crypto.getRandomValues(new Uint8Array(CODE_BYTES)),
  );
  await db.insert(oauthAuthorizationCodes).values({
    id: await hashToken(code),
    userId: input.userId,
    clientId: input.request.client.clientId,
    redirectUri: input.request.redirectUri,
    resource: input.request.resource,
    codeChallenge: input.request.codeChallenge,
    scopes: input.scopes,
    expiresAt: new Date(now().getTime() + CODE_TTL_MS),
  });
  return code;
}

export type AuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;

/**
 * Deletes the row whatever happens next, so a code is spent by its first
 * exchange, a failed one included. `null` for an unknown or expired code.
 */
export async function consumeAuthorizationCode(
  db: Db,
  code: string,
): Promise<AuthorizationCode | null> {
  const [row] = await db
    .delete(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.id, await hashToken(code)))
    .returning();
  if (row === undefined || row.expiresAt <= now()) return null;
  return row;
}

export async function issueRefreshToken(
  db: Db,
  input: {
    readonly grantId: number;
    readonly resource: string;
    readonly scopes: readonly string[];
  },
): Promise<string> {
  const token = generateToken();
  await db.insert(oauthRefreshTokens).values({
    id: await hashToken(token),
    ...input,
    expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

export interface RefreshedGrant {
  readonly grantId: number;
  readonly userId: number;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
}

/**
 * Spends `token` on first use. A rotated token presented again means two
 * parties hold it, so it revokes its grant's tokens. `null` when refused.
 */
export async function rotateRefreshToken(
  db: Db,
  token: string,
): Promise<RefreshedGrant | null> {
  const id = await hashToken(token);
  const found = await db
    .select({
      token: oauthRefreshTokens,
      userId: oauthGrants.userId,
      clientId: oauthGrants.clientId,
    })
    .from(oauthRefreshTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthRefreshTokens.grantId))
    .where(eq(oauthRefreshTokens.id, id))
    .get();
  if (found === undefined) return null;
  const { token: row, ...grant } = found;
  if (row.rotatedAt === null && row.expiresAt <= now()) return null;
  // Conditional, so of two concurrent uses only one rotates it.
  const rotated =
    row.rotatedAt === null &&
    (
      await db
        .update(oauthRefreshTokens)
        .set({ rotatedAt: now() })
        .where(
          and(
            eq(oauthRefreshTokens.id, id),
            isNull(oauthRefreshTokens.rotatedAt),
          ),
        )
        .returning({ id: oauthRefreshTokens.id })
    ).length > 0;
  if (!rotated) {
    await revokeGrantTokens(db, row.grantId, grant);
    return null;
  }
  return {
    grantId: row.grantId,
    ...grant,
    resource: row.resource,
    scopes: row.scopes,
  };
}

/** Access tokens first, so a failure part-way never leaves one live. */
async function revokeGrantTokens(
  db: Db,
  grantId: number,
  grant: { readonly userId: number; readonly clientId: string },
): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: now() })
    .where(
      and(
        eq(apiTokens.userId, grant.userId),
        eq(apiTokens.clientId, grant.clientId),
        isNull(apiTokens.revokedAt),
      ),
    );
  await db
    .delete(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.grantId, grantId));
}
