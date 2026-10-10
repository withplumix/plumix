import type { Db } from "../context/app-context.js";
import { and, eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { generateToken, hashToken } from "./tokens.js";

// Entry scope plus expiry is the whole security model; reusable until then so a
// reviewer can refresh and re-share.
const PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PreviewPayload {
  readonly entryId: number;
}

/** A verified preview grant: which entry it reveals, and which user minted it
 *  (so the render can overlay that user's autosave). */
export interface PreviewGrant {
  readonly entryId: number;
  readonly userId: number;
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
    expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS),
  });
  return token;
}

/** Does not consume the token: preview links stay valid until they expire. */
export async function verifyPreviewGrant(
  db: Db,
  rawToken: string,
): Promise<PreviewGrant | null> {
  const hash = await hashToken(rawToken);
  const row = await db.query.authTokens.findFirst({
    where: and(eq(authTokens.hash, hash), eq(authTokens.type, "preview_link")),
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  const entryId = (row.payload as PreviewPayload | null)?.entryId;
  if (typeof entryId !== "number" || row.userId === null) return null;
  return { entryId, userId: row.userId };
}

/** The entry id a token grants draft visibility for, or null. */
export async function verifyPreviewToken(
  db: Db,
  rawToken: string,
): Promise<number | null> {
  return (await verifyPreviewGrant(db, rawToken))?.entryId ?? null;
}
