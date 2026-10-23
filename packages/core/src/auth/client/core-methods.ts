import type { RedirectOptions } from "./define.js";
import type { OAuthProvider } from "./registry.js";
import type {
  ServerAuthenticationOptions,
  ServerRegistrationOptions,
} from "./webauthn.js";
import { defineAuthMethodClient } from "./define.js";
import { success } from "./result.js";
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

export const oauthClient = defineAuthMethodClient("oauth", (kernel) => ({
  // A navigation, not a fetch: the provider's consent screen is another
  // origin, and the callback lands the session.
  signIn: (provider: OAuthProvider, options: RedirectOptions = {}) => {
    const url = kernel.url(`${encodeURIComponent(provider)}/start`, options);
    kernel.navigate(url);
    return Promise.resolve(success<OAuthStarted>({ url }));
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
