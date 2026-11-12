import type { Db } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import { now } from "../clock.js";
import { and, eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { users } from "../db/schema/users.js";
import { generateToken, hashToken } from "./tokens.js";

/** Reusable until expiry so a reviewer can refresh and re-share. */
const PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PreviewPayload {
  readonly entryId: number;
}

/** A verified preview grant: which entry it reveals, and which user minted it
 *  (so the render can overlay that user's autosave). */
export interface PreviewGrant {
  readonly entryId: number;
  readonly minter: User;
}

export async function createPreviewToken(
  db: Db,
  args: { readonly entryId: number; readonly userId: number },
): Promise<string> {
  const token = generateToken();
  const hash = await hashToken(token);
  await db.insert(authTokens).values({
    hash,
    userId: args.userId,
    type: "preview_link",
    payload: { entryId: args.entryId } satisfies PreviewPayload,
    expiresAt: new Date(now().getTime() + PREVIEW_TOKEN_TTL_MS),
  });
  return token;
}

/**
 * Does not consume the token: preview links stay valid until they expire. A
 * disabled minter's tokens yield no grant.
 */
export async function verifyPreviewGrant(
  db: Db,
  rawToken: string,
): Promise<PreviewGrant | null> {
  const hash = await hashToken(rawToken);
  const row = await db
    .select({ token: authTokens, minter: users })
    .from(authTokens)
    .innerJoin(users, eq(authTokens.userId, users.id))
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "preview_link")))
    .get();
  if (!row || row.token.expiresAt.getTime() < now().getTime()) return null;
  if (row.minter.disabledAt) return null;
  const entryId = (row.token.payload as PreviewPayload | null)?.entryId;
  if (typeof entryId !== "number") return null;
  return { entryId, minter: row.minter };
}
