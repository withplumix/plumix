import type { AccountSession } from "./account-sessions.js";
import type {
  Account,
  AccountPatch,
  AccountState,
  LocaleSet,
} from "./account.js";
import type {
  inviteClient,
  magicLinkClient,
  oauthClient,
  passkeyClient,
} from "./core-methods.js";
import type { AuthMethodClient, RedirectOptions } from "./define.js";
import type { AuthClientKernelKey } from "./kernel-keys.js";
import type { AuthMethods } from "./render-context.js";
import type { AuthResult } from "./result.js";
import type { Session } from "./session.js";

/**
 * Every sign-in method's client half by its kebab-case name. A plugin adds
 * its own through `declare module "plumix"`, from a module its main entry
 * imports; core's are declared here.
 */
export interface AuthMethodRegistry {
  passkey: typeof passkeyClient;
  invite: typeof inviteClient;
  "magic-link": typeof magicLinkClient;
  oauth: typeof oauthClient;
}

/**
 * The site's OAuth providers by key. Empty until the site's config augments
 * it with `OAuthProvidersOf<typeof config>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an augmentation target
export interface OAuthProviderRegistry {}

/** The provider keys a config's `auth({ oauth })` declares. */
export type OAuthProvidersOf<TConfig> = TConfig extends {
  readonly auth: { readonly oauth?: infer TOAuth };
}
  ? NonNullable<TOAuth> extends { readonly providers: infer TProviders }
    ? {
        // `PlumixOAuthConfig`'s index signature rides along; only the keys
        // the site wrote are providers.
        readonly [
          K in keyof TProviders as string extends K ? never : K
        ]: TProviders[K];
      }
    : Record<never, never>
  : Record<never, never>;

/** A registry's keys, or any string while it is empty. */
export type OAuthProviderOf<TRegistry> = [keyof TRegistry] extends [never]
  ? string
  : Extract<keyof TRegistry, string>;

export type OAuthProvider = OAuthProviderOf<OAuthProviderRegistry>;

type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${CamelCase<Capitalize<Tail>>}`
  : S;

type ActionsOf<TKey extends keyof AuthMethodRegistry> =
  AuthMethodRegistry[TKey] extends AuthMethodClient<string, infer TActions>
    ? TActions
    : never;

type MethodName = Extract<keyof AuthMethodRegistry, string>;

export type AuthClientSignIn = {
  readonly [
    K in MethodName as ActionsOf<K> extends { readonly signIn: unknown }
      ? CamelCase<K>
      : never
  ]: ActionsOf<K> extends { readonly signIn: infer TSignIn } ? TSignIn : never;
};

type AuthClientExtras = {
  readonly [
    K in MethodName as [Exclude<keyof ActionsOf<K>, "signIn">] extends [never]
      ? never
      : CamelCase<K>
  ]: Omit<ActionsOf<K>, "signIn">;
};

/** Core's sign-out, or a method's route (its mount when `route` is absent). */
export type AuthUrlTarget =
  "signOut" | { readonly method: string; readonly route?: string };

export interface SignedOut {
  /**
   * An identity provider's logout URL, which must be followed or it signs
   * the visitor straight back in, else the call's `redirectTo`, else `null`.
   */
  readonly redirectTo: string | null;
}

/** The signed-in user's own account; every call acts on the session's user. */
export interface AuthClientAccount {
  /**
   * Saves over another user's edit lease. A stale copy reloads the account
   * and resolves `etag_mismatch`; a success refreshes the session.
   */
  update(patch: AccountPatch): Promise<AuthResult<Account>>;
  /**
   * Sets the user's locale to one of the site's enabled ones. The page keeps
   * the language it rendered in; what follows is the theme's call.
   */
  setLocale(code: string): Promise<AuthResult<LocaleSet>>;
}

/** The signed-in user's sessions; promises only, so list again after a change. */
export interface AuthClientSessions {
  list(): Promise<AuthResult<readonly AccountSession[]>>;
  /** Another session only; this one ends through `signOut()`. */
  revoke(id: string): Promise<AuthResult<{ id: string }>>;
  /** Every session but this one. */
  revokeOthers(): Promise<AuthResult<{ revoked: number }>>;
}

/** Refuses a member whose key `AUTH_CLIENT_KERNEL_KEYS` doesn't reserve. */
type ReservedKernel<
  T extends { [K in keyof T]: K extends AuthClientKernelKey ? unknown : never },
> = T;

/** The members the auth client answers itself, never a sign-in method. */
export type AuthClientKernel = ReservedKernel<{
  readonly account: AuthClientAccount;
  readonly sessions: AuthClientSessions;
  /** Loaded on first use, never from the server render. */
  useAccount(): AccountState;
  readonly signIn: AuthClientSignIn;
  /** Navigates only when called with `redirectTo`. */
  signOut(options?: RedirectOptions): Promise<AuthResult<SignedOut>>;
  /**
   * Seeded from the server render, and updated after a sign-in or sign-out
   * with no reload.
   */
  useSession(): Session;
  /** The listed methods and OAuth providers the render supplies. */
  useAuthMethods(): AuthMethods;
  /** For a plain `<form action>` or `<a href>`, which works with no script. */
  url(target: AuthUrlTarget, options?: RedirectOptions): string;
}>;

export type AuthClient = AuthClientKernel & AuthClientExtras;
