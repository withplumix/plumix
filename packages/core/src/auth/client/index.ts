import { createAuthClient } from "./auth-client.js";
import {
  currentAuthMethods,
  currentBasePath,
  renderedSession,
  seededSession,
} from "./render-context.js";

const created = createAuthClient({
  basePath: currentBasePath,
  session: seededSession,
  renderedSession,
  methods: currentAuthMethods,
});

export const authClient = created.authClient;

export const registerAuthMethodClients = created.registerAuthMethodClients;

export { defineAuthMethodClient } from "./define.js";
// For a page no server render produced.
export { seedAuthContext } from "./render-context.js";
export type {
  AuthMethodClient,
  AuthMethodClientKernel,
  RedirectOptions,
} from "./define.js";
export type { Account, AccountPatch, AccountState } from "./account.js";
export type { AccountSession } from "./account-sessions.js";
export type { AuthClientError, AuthResult } from "./result.js";
export type {
  AuthClient,
  AuthClientAccount,
  AuthClientSessions,
  AuthClientSignIn,
  AuthMethodRegistry,
  AuthUrlTarget,
  OAuthProvider,
  OAuthProviderRegistry,
  OAuthProvidersOf,
  SignedOut,
} from "./registry.js";
export type { AuthMethods, EmbeddedAuthContext } from "./render-context.js";
export type { Session, SessionUser } from "./session.js";
export type {
  Invitee,
  LinkedOAuthAccount,
  Passkey,
  SignedIn,
} from "./core-methods.js";
