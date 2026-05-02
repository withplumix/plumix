import type { Db } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import { and, eq, isUniqueConstraintError } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { provisionUser } from "../bootstrap.js";
import { hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";

/**
 * Consume a magic-link token and return the matching user.
 *
 *   userId set in the token row → sign-in (existing user).
 *   userId null in the token row → signup. Re-check `allowed_domains`
 *     at this moment (admin could have disabled the domain after
 *     issuance), refuse if zero users (bootstrap rail), then provision.
 *
 * Atomic compare-and-delete via `DELETE … RETURNING` — a concurrent
 * second verify of the same token sees an empty result, never the same
 * row twice. Scoped by `type='magic_link'` so a hash collision with
 * another token type can't accidentally consume that row.
 *
 * The link click implicitly verifies that the user has access to the
 * email's inbox — no separate emailVerified gate is needed (unlike the
 * OAuth path, where the provider's verified-email claim is the gate).
 */
export async function verifyMagicLink(db: Db, rawToken: string): Promise<User> {
  const hash = await hashToken(rawToken);

  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "magic_link")))
    .returning();

  if (!row) throw new MagicLinkError("token_invalid");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new MagicLinkError("token_expired");
  }
  if (row.email === null) {
    // Defensive: every magic_link row written by `requestMagicLink`
    // sets email. A null here means hand-rolled DB state.
    throw new MagicLinkError("token_invalid");
  }

  if (row.userId !== null) {
    return resolveExistingUser(db, row.userId);
  }
  return resolveSignup(db, row.email);
}

async function resolveExistingUser(db: Db, userId: number): Promise<User> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) throw new MagicLinkError("token_invalid");
  if (user.disabledAt) throw new MagicLinkError("account_disabled");
  return user;
}

async function resolveSignup(db: Db, email: string): Promise<User> {
  // The token was issued because no user existed and the domain was
  // allowed. Anything could have changed in the meantime — re-check
  // every gate at the verify boundary.

  // Race vs another sign-in path (passkey, oauth) creating the same
  // email. Treat that as a successful sign-in for the existing user —
  // the click verifies the email, which is at least as strong as
  // OAuth's email-verified link path.
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    if (existing.disabledAt) throw new MagicLinkError("account_disabled");
    return existing;
  }

  const userCount = await db.$count(users);
  if (userCount === 0) {
    throw new MagicLinkError("registration_closed");
  }

  const domain = extractDomain(email);
  if (!domain) throw new MagicLinkError("token_invalid");
  const allowed = await db.query.allowedDomains.findFirst({
    where: eq(allowedDomains.domain, domain),
  });
  if (!allowed?.isEnabled) {
    throw new MagicLinkError("domain_not_allowed");
  }

  try {
    const { user } = await provisionUser(db, {
      email,
      defaultRole: allowed.defaultRole,
      emailVerified: true,
    });
    return user;
  } catch (error) {
    // Race: another path created a user with this email between the
    // existing-user check above and this insert. Re-resolve and treat
    // as sign-in.
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!raced) throw error;
    if (raced.disabledAt) throw new MagicLinkError("account_disabled");
    return raced;
  }
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
