import type { Db } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import { eq, isUniqueConstraintError } from "../db/index.js";
import { allowedDomains } from "../db/schema/allowed_domains.js";
import { users } from "../db/schema/users.js";
import { provisionUser } from "./bootstrap.js";

export type ExternalIdentityErrorCode =
  | "email_unverified"
  | "account_disabled"
  | "domain_not_allowed"
  | "registration_closed";

export class ExternalIdentityError extends Error {
  readonly code: ExternalIdentityErrorCode;

  constructor(code: ExternalIdentityErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExternalIdentityError";
    this.code = code;
  }
}

export interface ExternalIdentityInput {
  /** Lowercased + normalised in advance by the caller. */
  readonly email: string;
  /**
   * Whether the inbound flow has verified the email-inbox ownership.
   * - OAuth: provider's `emailVerified` claim.
   * - Magic-link: always true (the link click is the verification).
   * - SAML / enterprise SSO: typically true (signed assertion).
   * - Untrusted form input: false.
   */
  readonly emailVerified: boolean;
  readonly name?: string | null;
  readonly avatarUrl?: string | null;
  /**
   * When set, skip the `allowed_domains` lookup and provision new
   * users with this role directly. Use for enterprise SSO flows where
   * the IdP/group mapping decides the role; the allowlist isn't
   * relevant. Required when `allowedDomainsGate: false`.
   */
  readonly defaultRole?: UserRole;
  /**
   * Default `true` — provision new users only when the email's domain
   * is in `allowed_domains` with `isEnabled = true`. Set `false` for
   * enterprise SSO where the IdP is the gate (e.g. CF Access already
   * filtered who can reach plumix); pair with an explicit
   * `defaultRole`.
   */
  readonly allowedDomainsGate?: boolean;
  /**
   * Default `false` — refuse to provision when the system has zero
   * users (bootstrap rail; passkey is the dedicated first-admin path).
   * Set `true` for enterprise SSO deployments that want first-admin via
   * the same mechanism (e.g. CF Access JWT mints the first admin).
   */
  readonly bootstrapAllowed?: boolean;
}

export interface ResolvedExternalUser {
  readonly user: User;
  /** True when this call provisioned a new user row. */
  readonly created: boolean;
}

/**
 * Map an external auth flow (OAuth callback, magic-link verify, SAML
 * ACS, custom enterprise SSO) to a local plumix user — provisioning
 * if the gates allow and the user doesn't yet exist.
 *
 * The shared shape across every external flow:
 *
 *   1. user already exists by email
 *      → emailVerified gate (refuse linking when the inbound flow
 *        can't prove email-inbox ownership; only relevant for
 *        OAuth-style flows where a third-party provider could lie
 *        about the email string)
 *      → disabled-account gate
 *      → return existing user
 *
 *   2. user does not exist
 *      → emailVerified gate (refuse provisioning without inbox proof)
 *      → bootstrap rail (refuse when zero users, unless caller opts in)
 *      → role resolution (allowed_domains lookup OR explicit default)
 *      → provision via the existing `provisionUser` (which handles the
 *        atomic CASE-WHEN-COUNT first-admin election)
 *
 *   3. race-on-insert
 *      → if another flow concurrently provisioned the same email
 *        between the existence check and the insert, fall through to
 *        branch 1 idempotently
 *
 * Errors are typed `ExternalIdentityError`; the caller maps to its
 * own user-facing code set (OAuthError, MagicLinkError, etc.).
 */
export async function resolveExternalIdentity(
  db: Db,
  input: ExternalIdentityInput,
): Promise<ResolvedExternalUser> {
  try {
    return await resolveOnce(db, input);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return resolveOnce(db, input);
  }
}

async function resolveOnce(
  db: Db,
  input: ExternalIdentityInput,
): Promise<ResolvedExternalUser> {
  const allowedDomainsGate = input.allowedDomainsGate ?? true;
  const bootstrapAllowed = input.bootstrapAllowed ?? false;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existing) {
    if (!input.emailVerified) {
      // Auto-linking an unverified email to an existing local user
      // would let an attacker who controls a third-party account that
      // claims `victim@gmail.com` take over the local row. Refuse.
      throw new ExternalIdentityError("email_unverified");
    }
    if (existing.disabledAt) {
      throw new ExternalIdentityError("account_disabled");
    }
    return { user: existing, created: false };
  }

  // No existing user — provision via the configured gate.
  if (!input.emailVerified) {
    throw new ExternalIdentityError("email_unverified");
  }

  if (!bootstrapAllowed) {
    const userCount = await db.$count(users);
    if (userCount === 0) {
      throw new ExternalIdentityError("registration_closed");
    }
  }

  const role = allowedDomainsGate
    ? await roleFromAllowedDomain(db, input.email)
    : input.defaultRole;
  if (role === undefined) {
    // `allowedDomainsGate: false` requires an explicit defaultRole.
    // Falling through with `undefined` would silently default the
    // user to "subscriber" via the schema default — surfacing as a
    // config bug instead.
    throw new Error(
      "resolveExternalIdentity: allowedDomainsGate=false requires an explicit defaultRole",
    );
  }

  const { user } = await provisionUser(db, {
    email: input.email,
    name: input.name,
    avatarUrl: input.avatarUrl,
    defaultRole: role,
    emailVerified: true,
  });
  return { user, created: true };
}

async function roleFromAllowedDomain(db: Db, email: string): Promise<UserRole> {
  const domain = extractDomain(email);
  if (!domain) throw new ExternalIdentityError("domain_not_allowed");
  const allowed = await db.query.allowedDomains.findFirst({
    where: eq(allowedDomains.domain, domain),
  });
  if (!allowed?.isEnabled) {
    throw new ExternalIdentityError("domain_not_allowed");
  }
  return allowed.defaultRole;
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
