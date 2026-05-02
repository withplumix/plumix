// Public OAuth surface. Internals (PKCE primitives, state store, provider
// singletons, GitHub email helper, the `consumer` exchange/fetch helpers,
// the path parser) are intentionally NOT re-exported — they're only used
// by the dispatcher + tests, which import them by file path. Keeping the
// barrel narrow prevents accidental load-bearing dependencies on internal
// helpers ahead of the 0.1.0 freeze.

export { OAUTH_ERROR_CODES, OAuthError } from "./errors.js";
export type { OAuthErrorCode } from "./errors.js";

export { handleOAuthCallback, handleOAuthStart } from "./routes.js";

export { OAUTH_PROVIDER_KEYS } from "./types.js";
export type {
  OAuthClientConfig,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderKey,
  OAuthProvidersConfig,
} from "./types.js";
