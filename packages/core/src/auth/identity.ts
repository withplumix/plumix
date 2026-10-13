import type { Db } from "../context/app-context.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { JsonObject } from "../json.js";
import { and, eq, isUniqueConstraintError } from "../db/index.js";
import { allowedDomains } from "../db/schema/allowed_domains.js";
import { oauthAccounts } from "../db/schema/oauth_accounts.js";
import { users } from "../db/schema/users.js";
import { provisionUser } from "./bootstrap.js";

export type ExternalIdentityErrorCode =
  | "email_unverified"
  | "account_disabled"
  | "domain_not_allowed"
  | "registration_closed"
  | "link_broken"
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

  static linkBroken(): ExternalIdentityError {
    return new ExternalIdentityError("link_broken", "link_broken");
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
   * True only when the flow proved inbox ownership, as a magic-link click or a
   * provider's verified claim does.
   */
  readonly emailVerified: boolean;
  readonly name?: string | null;
  readonly avatarUrl?: string | null;
  /** Required when `allowedDomainsGate` is `false`. */
  readonly defaultRole?: UserRole;
  /**
   * Defaults to `true`. Set `false` when an upstream IdP already gates who can
   * sign in, and pass `defaultRole`.
   */
  readonly allowedDomainsGate?: boolean;
  /**
   * Defaults to `false`, refusing the first user, because passkey is the
   * dedicated first-admin path.
   */
  readonly bootstrapAllowed?: boolean;
  /** Ignored for an existing user. */
  readonly meta: JsonObject;
  /**
   * An account at an identity provider. Once linked it signs its user in
   * whatever email the provider reports.
   */
  readonly providerAccount?: ProviderAccount;
}

interface ProviderAccount {
  readonly provider: string;
  readonly accountId: string;
}

export interface ResolvedExternalUser {
  readonly user: User;
  /** True when this call provisioned a new user row. */
  readonly created: boolean;
}

/**
 * Throws `ExternalIdentityError`. Both linking and provisioning require
 * `emailVerified`.
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
  const { providerAccount } = input;
  if (providerAccount === undefined) return resolveByEmail(db, input);
  const linked = await findLinkedUser(db, providerAccount);
  if (linked !== undefined) return { user: linked, created: false };
  const resolved = await resolveByEmail(db, input);
  await linkProviderAccount(db, providerAccount, resolved.user.id);
  return resolved;
}

/** `undefined` when no link exists; throws when the link is unusable. */
async function findLinkedUser(
  db: Db,
  account: ProviderAccount,
): Promise<User | undefined> {
  const link = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, account.provider),
      eq(oauthAccounts.providerAccountId, account.accountId),
    ),
  });
  if (!link) return undefined;
  const user = await db.query.users.findFirst({
    where: eq(users.id, link.userId),
  });
  // The cascade didn't fire; a distinct code tells the user to contact
  // support, not that they're disabled.
  if (!user) throw ExternalIdentityError.linkBroken();
  if (user.disabledAt) throw ExternalIdentityError.accountDisabled();
  return user;
}

async function linkProviderAccount(
  db: Db,
  account: ProviderAccount,
  userId: number,
): Promise<void> {
  try {
    await db.insert(oauthAccounts).values({
      provider: account.provider,
      providerAccountId: account.accountId,
      userId,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // A concurrent sign-in linked the same email-keyed user first.
  }
}

async function resolveByEmail(
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
    meta: input.meta,
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

/** Returns null, not a throw, for input not shaped like `local@domain`. */
export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
