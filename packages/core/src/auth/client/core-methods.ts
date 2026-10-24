import * as v from "valibot";

import type { RedirectOptions } from "./define.js";
import type { OAuthProvider } from "./registry.js";
import type {
  ServerAuthenticationOptions,
  ServerRegistrationOptions,
} from "./webauthn.js";
import { defineAuthMethodClient } from "./define.js";
import { failure, success } from "./result.js";
import { createCredential, getCredential } from "./webauthn.js";

/** What a fetch that signed someone in answers. */
export interface SignedIn {
  readonly userId: number;
  readonly redirectTo: string;
}

interface MagicLinkSent {
  readonly ok: boolean;
  readonly message: string;
}

export const magicLinkClient = defineAuthMethodClient(
  "magic-link",
  (kernel) => ({
    signIn: ({
      email,
      redirectTo,
    }: { readonly email: string } & RedirectOptions) =>
      kernel.post<MagicLinkSent>("request", { email }, { redirectTo }),
  }),
);

interface OAuthStarted {
  /** The start URL the browser was sent to. */
  readonly url: string;
}

/** A provider account linked to the signed-in user. */
export interface LinkedOAuthAccount {
  /** The provider's id for the account. */
  readonly id: string;
  readonly provider: OAuthProvider;
  readonly linkedAt: Date;
}

const linkedAccountsSchema = v.array(
  v.object({
    id: v.string(),
    provider: v.string(),
    linkedAt: v.pipe(
      v.string(),
      v.transform((iso) => new Date(iso)),
    ),
  }),
);

const unlinkedSchema = v.object({ provider: v.string() });

export const oauthClient = defineAuthMethodClient("oauth", (kernel) => ({
  // A navigation, not a fetch: the provider's consent screen is another
  // origin, and the callback lands the session.
  signIn: (provider: OAuthProvider, options: RedirectOptions = {}) => {
    const url = kernel.url(`${encodeURIComponent(provider)}/start`, options);
    kernel.navigate(url);
    return Promise.resolve(success<OAuthStarted>({ url }));
  },
  /** The session's user's linked accounts, oldest first. No cache. */
  accounts: async () => {
    const result = await kernel.rpc("auth/oauthAccounts/list");
    if (result.error) return result;
    const answer = v.safeParse(linkedAccountsSchema, result.data);
    if (!answer.success) return failure("unknown");
    // Safety: the server lists only providers the site's config declares.
    return success(answer.output as readonly LinkedOAuthAccount[]);
  },
  /**
   * Removes every link to `provider`. Resolves `last_sign_in_method` when it
   * would leave the user no way to sign in.
   */
  unlink: async (provider: OAuthProvider) => {
    const result = await kernel.rpc("auth/oauthAccounts/unlink", { provider });
    if (result.error) return result;
    const answer = v.safeParse(unlinkedSchema, result.data);
    if (!answer.success) return failure("unknown");
    // Safety: the server echoes the provider the call named.
    return success(answer.output as { readonly provider: OAuthProvider });
  },
}));

/** One of the signed-in user's passkeys. */
export interface Passkey {
  readonly id: string;
  /** `null` until the user names it. */
  readonly name: string | null;
  readonly isBackedUp: boolean;
  readonly transports: readonly string[] | null;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly lastUsedAt: string;
}

export const passkeyClient = defineAuthMethodClient("passkey", (kernel) => ({
  /** Without `email`, the browser offers every passkey it holds for the site. */
  signIn: async ({
    email,
    redirectTo,
  }: { readonly email?: string } & RedirectOptions = {}) => {
    const options = await kernel.post<ServerAuthenticationOptions>(
      "login/options",
      email ? { email } : {},
    );
    if (options.error) return options;
    const outcome = await getCredential(options.data);
    if ("code" in outcome) return kernel.fail(outcome.code);
    return kernel.post<SignedIn>("login/verify", outcome.credential, {
      redirectTo,
    });
  },
  /**
   * `email` is required: the first account's bootstrap has no session to
   * take it from.
   */
  register: async ({
    email,
    name,
    redirectTo,
  }: { readonly email: string; readonly name?: string } & RedirectOptions) => {
    const options = await kernel.post<ServerRegistrationOptions>(
      "register/options",
      { email, ...(name ? { name } : {}) },
    );
    if (options.error) return options;
    const outcome = await createCredential(options.data);
    if ("code" in outcome) return kernel.fail(outcome.code);
    return kernel.post<SignedIn>("register/verify", outcome.credential, {
      redirectTo,
    });
  },
  /** The session user's passkeys, oldest first. */
  list: () => kernel.rpc<readonly Passkey[]>("auth/credentials/list"),
  rename: (id: string, name: string) =>
    kernel.rpc<Pick<Passkey, "id" | "name">>("auth/credentials/rename", {
      id,
      name,
    }),
  remove: (id: string) =>
    kernel.rpc<Pick<Passkey, "id">>("auth/credentials/delete", { id }),
}));

/** Who an invite is for, shown before the visitor taps their passkey. */
export interface Invitee {
  readonly email: string;
  readonly role: string;
  readonly name: string | null;
}

/** Unlisted: an invite has no sign-in of its own, only its registration. */
export const inviteClient = defineAuthMethodClient("invite", (kernel) => ({
  /** Consumes the token: a second attempt resolves `invalid_token`. */
  register: async ({
    token,
    name,
    redirectTo,
  }: { readonly token: string; readonly name?: string } & RedirectOptions) => {
    const options = await kernel.post<{
      readonly options: ServerRegistrationOptions;
      readonly invitee: Invitee;
    }>("register/options", { token, ...(name ? { name } : {}) });
    if (options.error) return options;
    const outcome = await createCredential(options.data.options);
    if ("code" in outcome) return kernel.fail(outcome.code);
    // Nested under `response`, unlike `passkey/register/verify`.
    const verified = await kernel.post<SignedIn>(
      "register/verify",
      { token, response: outcome.credential },
      { redirectTo },
    );
    if (verified.error) return verified;
    return success({ ...verified.data, invitee: options.data.invitee });
  },
}));

export const CORE_METHOD_CLIENTS = [
  passkeyClient,
  inviteClient,
  magicLinkClient,
  oauthClient,
] as const;
