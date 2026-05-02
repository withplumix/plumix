export { buildAuthorizeUrl, exchangeAndFetchProfile } from "./consumer.js";
export type {
  BuildAuthorizeUrlInput,
  BuiltAuthorizeUrl,
  ExchangeAndFetchInput,
} from "./consumer.js";

export { OAUTH_ERROR_CODES, OAuthError } from "./errors.js";
export type { OAuthErrorCode } from "./errors.js";

export { computeS256Challenge, generateCodeVerifier } from "./pkce.js";

export {
  handleOAuthCallback,
  handleOAuthStart,
  parseOAuthPath,
} from "./routes.js";

export { resolveOAuthUser } from "./signup.js";
export type { ResolveOAuthUserInput, ResolvedOAuthUser } from "./signup.js";

export {
  consumeOAuthState,
  issueOAuthState,
  OAUTH_STATE_TTL_SECONDS,
} from "./state.js";
export type { IssuedOAuthState, OAuthStatePayload } from "./state.js";

export { OAUTH_PROVIDER_KEYS } from "./types.js";
export type {
  OAuthClientConfig,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderKey,
  OAuthProvidersConfig,
} from "./types.js";

export {
  fetchPrimaryEmail,
  getProvider,
  github,
  google,
} from "./providers/index.js";
