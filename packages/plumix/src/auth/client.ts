// `plumix/auth/client`: browser-safe, so a theme island or a plugin's method
// half imports it. Its registries are augmented through `plumix` itself.
export {
  authClient,
  defineAuthMethodClient,
  registerAuthMethodClients,
} from "@plumix/core/auth/client";
export type {
  AuthClient,
  AuthClientError,
  AuthClientSignIn,
  AuthMethodClient,
  AuthMethodClientKernel,
  AuthMethods,
  AuthResult,
  AuthUrlTarget,
  Invitee,
  OAuthProvider,
  RedirectOptions,
  Session,
  SessionUser,
  SignedIn,
  SignedOut,
} from "@plumix/core/auth/client";
