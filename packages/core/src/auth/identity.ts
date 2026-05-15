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
  | "registration_closed"
  | "default_role_required";

export class ExternalIdentityError extends Error {
  static {
    ExternalIdentityError.prototype.name = "ExternalIdentityError";
  }

  readonly code: ExternalIdentityErrorCode;

  private constructor(code: ExternalIdentityErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static emailUnverified(): ExternalIdentityError {
    return new ExternalIdentityError("email_unverified", "email_unverified");
  }

  static accountDisabled(): ExternalIdentityError {
    return new ExternalIdentityError("account_disabled", "account_disabled");
  }

  static domainNotAllowed(): ExternalIdentityError {
    return new ExternalIdentityError(
      "domain_not_allowed",
      "domain_not_allowed",
    );
  }

  static registrationClosed(): ExternalIdentityError {
    return new ExternalIdentityError(
      "registration_closed",
      "registration_closed",
    );
  }

  static defaultRoleRequired(): ExternalIdentityError {
    return new ExternalIdentityError(
      "default_role_required",
      "resolveExternalIdentity: allowedDomainsGate=false requires an explicit defaultRole",
    );
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
      throw ExternalIdentityError.emailUnverified();
    }
    if (existing.disabledAt) {
      throw ExternalIdentityError.accountDisabled();
    }
    return { user: existing, created: false };
  }

  // No existing user — provision via the configured gate.
  if (!input.emailVerified) {
    throw ExternalIdentityError.emailUnverified();
  }

  if (!bootstrapAllowed) {
    const userCount = await db.$count(users);
    if (userCount === 0) {
      throw ExternalIdentityError.registrationClosed();
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
    throw ExternalIdentityError.defaultRoleRequired();
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
  if (!domain) throw ExternalIdentityError.domainNotAllowed();
  const allowed = await db.query.allowedDomains.findFirst({
    where: eq(allowedDomains.domain, domain),
  });
  if (!allowed?.isEnabled) {
    throw ExternalIdentityError.domainNotAllowed();
  }
  return allowed.defaultRole;
}

/**
 * Extract the (lowercased) domain part of an email. Returns null when
 * the value isn't shaped like `local@domain` — empty local part,
 * empty domain part, or no `@` at all.
 *
 * Defensive: callers higher up usually validate via valibot's
 * `v.email()` before calling, but this is the boundary helper for
 * `allowed_domains` lookups across every external auth flow, so
 * tolerate malformed input rather than throw.
 */
export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
