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
// The admin's: it is no server render, so it seeds its own context.
export { seedAuthContext } from "./render-context.js";
export type {
  AuthMethodClient,
  AuthMethodClientKernel,
  RedirectOptions,
} from "./define.js";
export type { AuthClientError, AuthResult } from "./result.js";
export type {
  AuthClient,
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
export type { Invitee, SignedIn } from "./core-methods.js";
