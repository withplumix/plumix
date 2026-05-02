// Public OAuth surface.
//
// Built-in provider factories (`github`, `google`) ship from this barrel
// alongside the public types so a user wiring up `auth({ oauth: ... })`
// has everything from one import:
//
//   import { auth, github, google } from "@plumix/core";
//
// User-defined providers live in user code — they implement
// `OAuthProviderClient` (often via a factory matching the
// `OAuthProviderFactory` signature) and pass the result into the same
// `oauth.providers` map. Adding a third built-in or a custom provider
// follows the same path; no privileged registry, no const enum.
//
// Internals (PKCE, state store, consumer, signup, route handlers, the
// path parser) are imported directly by the dispatcher and tests; they
// don't leave the package.

export { OAUTH_ERROR_CODES, OAuthError } from "./errors.js";
export type { OAuthErrorCode } from "./errors.js";

export { handleOAuthCallback, handleOAuthStart } from "./routes.js";

export { github, google } from "./providers/index.js";

export { OAUTH_PROVIDER_KEY_PATTERN } from "./types.js";
export type {
  OAuthClientConfig,
  OAuthProfile,
  OAuthProviderClient,
  OAuthProviderFactory,
} from "./types.js";
