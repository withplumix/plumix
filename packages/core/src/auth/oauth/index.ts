export { OAUTH_ERROR_CODES, OAuthError } from "./errors.js";
export type { OAuthErrorCode } from "./errors.js";

export { handleOAuthCallback, handleOAuthStart } from "./routes.js";

export { github, google } from "./providers/index.js";

export { OAUTH_PROVIDER_KEY_PATTERN } from "../contract/oauth.js";
export type {
  OAuthClientConfig,
  OAuthProfile,
  OAuthProviderClient,
  OAuthProviderFactory,
} from "../contract/oauth.js";
