import type { AppContext } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import type { JsonValue } from "../json.js";

/** Why the identity rules refused a sign-in. */
export type IdentityRefusalCode =
  | "email_unverified"
  | "account_disabled"
  | "domain_not_allowed"
  | "registration_closed"
  | "link_broken";

/**
 * Proof of an email address. Signs in the account it belongs to, or creates
 * one where the site's sign-up rules allow.
 */
export interface EmailProof {
  readonly email: string;
  /** True only when the method proved the caller owns the inbox. */
  readonly emailVerified: boolean;
  /** Once linked, it signs its account in whatever email it later reports. */
  readonly providerAccount?: {
    readonly provider: string;
    readonly accountId: string;
  };
  /** Used only when the account is created. */
  readonly profile?: {
    readonly name?: string | null;
    readonly avatarUrl?: string | null;
  };
}

/** Proof of a credential bound to one existing account. Creates nothing. */
export interface AccountProof {
  readonly userId: number;
}

export type IdentityProof = EmailProof | AccountProof;

interface ProveIdentityOptions {
  /**
   * A value the method carried itself, such as through OAuth state. Defaults
   * to the request's `?redirectTo=`.
   */
  readonly redirectTo?: string;
  /** Runs after the session exists and before `user:signed_in`. */
  readonly afterSession?: (user: User) => void | Promise<void>;
}

export interface ProveAccountOptions extends ProveIdentityOptions {
  readonly firstSignIn?: boolean;
}

/**
 * What a sign-in method's handler works through. Each answer takes the
 * caller's transport: JSON for a fetch carrying `X-Plumix-Request`, a `302`
 * for a navigation, a `303` for a form post.
 */
export interface AuthMethodKernel<TCode extends string = string> {
  /** With the base path stripped. */
  readonly request: Request;
  readonly ctx: AppContext;
  /** The route's `:param` segments. */
  readonly params: Readonly<Record<string, string>>;
  /** With the base path. */
  readonly loginPath: string;
  /**
   * A fetch's JSON body, or a form post's string fields. `null` when the body
   * doesn't parse.
   */
  readInput(): Promise<JsonValue>;
  /**
   * Validates `value`, or the request's `?redirectTo=` when called with none.
   * `undefined` when the value is absent or empty; the site root when unsafe.
   */
  readRedirectTo(value?: string): string | undefined;
  /**
   * Signs the proven account in and answers with its session cookie, or
   * refuses through `fail` with a `403`.
   */
  proveIdentity(
    proof: EmailProof,
    options?: ProveIdentityOptions,
  ): Promise<Response>;
  proveIdentity(
    proof: AccountProof,
    options?: ProveAccountOptions,
  ): Promise<Response>;
  /** A navigation or form post lands on `loginPath?<key>_error=<code>`. */
  fail(
    code: TCode | IdentityRefusalCode,
    options?: { readonly status?: number },
  ): Response;
  /** A navigation or form post lands on `loginPath?<key>_<name>=1`. */
  notice(name: string, body?: unknown): Response;
}

type AuthMethodHandler<TCode extends string = string> = (
  auth: AuthMethodKernel<TCode>,
) => Response | Promise<Response>;

export interface AuthMethodRoute<TCode extends string = string> {
  readonly method: "GET" | "POST";
  /**
   * Also accept a same-origin POST without `X-Plumix-Request`, run with no
   * ambient principal.
   */
  readonly formPost?: boolean;
  readonly handler: AuthMethodHandler<TCode>;
}

export interface AuthMethodDefinition<TCode extends string = string> {
  /** A kebab-case slug, mounted at `/_plumix/auth/<name>/`. */
  readonly name: string;
  readonly label: string;
  /**
   * `false` keeps it out of `authClient.useAuthMethods()` and
   * `auth.signInMethods`.
   */
  readonly listed?: boolean;
  /** The codes `fail` accepts besides the identity refusals. */
  readonly errorCodes?: readonly TCode[];
  /** Keyed by path under the mount; a `:param` segment matches any one. */
  readonly routes: Readonly<Record<string, AuthMethodRoute<TCode>>>;
  /**
   * A browser-safe module default-exporting this method's
   * `defineAuthMethodClient(name, …)`: a package subpath resolved from the
   * site root (`"@acme/plumix-otp/client"`), or an absolute path.
   */
  readonly client?: string;
}

export function defineAuthMethod<const TCode extends string = never>(
  method: AuthMethodDefinition<TCode>,
): AuthMethodDefinition<TCode> {
  return method;
}
