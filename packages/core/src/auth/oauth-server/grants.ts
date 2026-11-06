import type { Db } from "../../context/app-context.js";
import type { AuthorizationRequest } from "./authorization-request.js";
import { now } from "../../clock.js";
import { and, eq } from "../../db/index.js";
import { oauthAuthorizationCodes } from "../../db/schema/oauth_authorization_codes.js";
import { oauthGrants } from "../../db/schema/oauth_grants.js";
import { encodeBase64url } from "../../encoding.js";
import { hashToken } from "../tokens.js";

const CODE_BYTES = 32;
const CODE_TTL_MS = 10 * 60_000;

/** The capabilities `userId` granted `clientId`; `null` before any consent. */
export async function findOAuthGrant(
  db: Db,
  userId: number,
  clientId: string,
): Promise<readonly string[] | null> {
  const row = await db
    .select({ scopes: oauthGrants.scopes })
    .from(oauthGrants)
    .where(
      and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId)),
    )
    .get();
  return row?.scopes ?? null;
}

export function oauthGrantCovers(
  granted: readonly string[],
  requested: readonly string[],
): boolean {
  const held = new Set(granted);
  return requested.every((capability) => held.has(capability));
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
