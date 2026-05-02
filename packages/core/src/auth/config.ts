import * as v from "valibot";

import type { OAuthProviderClient } from "./oauth/types.js";
import type { PasskeyConfig } from "./passkey/config.js";
import type { SessionPolicy } from "./sessions.js";
import { OAUTH_PROVIDER_KEY_PATTERN } from "./oauth/types.js";

export interface PlumixOAuthConfig {
  /**
   * Map of provider keys → configured provider clients. The map key
   * doubles as the URL path segment (`/_plumix/auth/oauth/<key>/start`)
   * and the value of `oauth_accounts.provider` for any user that signs
   * in via this provider. Pass instances from `github(creds)` /
   * `google(creds)` (built-ins) or from your own factory implementing
   * `OAuthProviderClient` for provider parity.
   */
  readonly providers: Readonly<Record<string, OAuthProviderClient>>;
}

export interface PlumixAuthInput {
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
}

export interface PlumixAuthConfig {
  readonly kind: "plumix";
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
}

export interface PlumixConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class PlumixConfigError extends Error {
  readonly issues: readonly PlumixConfigIssue[];

  constructor(message: string, issues: readonly PlumixConfigIssue[]) {
    super(message);
    this.name = "PlumixConfigError";
    this.issues = issues;
  }
}

const passkeySchema = v.object({
  rpName: v.pipe(v.string(), v.nonEmpty("rpName must be a non-empty string")),
  rpId: v.pipe(v.string(), v.nonEmpty("rpId must be a non-empty string")),
  origin: v.pipe(v.string(), v.url("origin must be a valid URL")),
});

const sessionPolicySchema = v.pipe(
  v.object({
    maxAgeSeconds: v.pipe(
      v.number(),
      v.integer("maxAgeSeconds must be an integer"),
      v.minValue(1, "maxAgeSeconds must be ≥ 1"),
    ),
    absoluteMaxAgeSeconds: v.pipe(
      v.number(),
      v.integer("absoluteMaxAgeSeconds must be an integer"),
      v.minValue(1, "absoluteMaxAgeSeconds must be ≥ 1"),
    ),
    refreshThreshold: v.pipe(
      v.number(),
      v.minValue(0, "refreshThreshold must be in [0, 1]"),
      v.maxValue(1, "refreshThreshold must be in [0, 1]"),
    ),
  }),
  v.check(
    (s) => s.absoluteMaxAgeSeconds >= s.maxAgeSeconds,
    "absoluteMaxAgeSeconds must be ≥ maxAgeSeconds",
  ),
);

// Provider clients are user-supplied factory output — we shape-check the
// minimum required fields so a malformed entry surfaces at config time
// rather than at the first sign-in attempt. Anything beyond these (the
// `parseProfile` impl, optional hooks) is the provider author's contract.
const oauthProviderClientSchema = v.object({
  label: v.pipe(v.string(), v.nonEmpty("provider label must be non-empty")),
  authorizeUrl: v.pipe(v.string(), v.url("authorizeUrl must be a valid URL")),
  tokenUrl: v.pipe(v.string(), v.url("tokenUrl must be a valid URL")),
  userInfoUrl: v.pipe(v.string(), v.url("userInfoUrl must be a valid URL")),
  scopes: v.array(v.string()),
  client: v.object({
    clientId: v.pipe(v.string(), v.nonEmpty("clientId must be non-empty")),
    clientSecret: v.pipe(
      v.string(),
      v.nonEmpty("clientSecret must be non-empty"),
    ),
  }),
  parseProfile: v.pipe(
    v.unknown(),
    v.check(
      (val) => typeof val === "function",
      "parseProfile must be a function",
    ),
  ),
  // optional hooks — present-or-absent, no shape check beyond function
  decorateAuthorizeUrl: v.optional(
    v.pipe(
      v.unknown(),
      v.check(
        (val) => typeof val === "function",
        "decorateAuthorizeUrl must be a function",
      ),
    ),
  ),
  fetchVerifiedEmail: v.optional(
    v.pipe(
      v.unknown(),
      v.check(
        (val) => typeof val === "function",
        "fetchVerifiedEmail must be a function",
      ),
    ),
  ),
});

const oauthSchema = v.pipe(
  v.object({
    providers: v.record(
      v.pipe(
        v.string(),
        v.regex(
          OAUTH_PROVIDER_KEY_PATTERN,
          "oauth.providers key must be lowercase alphanum + dash/underscore (1-32 chars)",
        ),
      ),
      oauthProviderClientSchema,
    ),
  }),
  v.check(
    (cfg) => Object.keys(cfg.providers).length > 0,
    "oauth.providers must declare at least one provider",
  ),
);

const authInputSchema = v.object({
  passkey: passkeySchema,
  sessions: v.optional(sessionPolicySchema),
  oauth: v.optional(oauthSchema),
});

function toIssues(
  issues: readonly v.BaseIssue<unknown>[],
): PlumixConfigIssue[] {
  return issues.map((issue) => ({
    path: v.getDotPath(issue) ?? "",
    message: issue.message,
  }));
}

export function auth(input: PlumixAuthInput): PlumixAuthConfig {
  const result = v.safeParse(authInputSchema, input);
  if (!result.success) {
    const issues = toIssues(result.issues);
    const summary = issues
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join("; ");
    throw new PlumixConfigError(`Invalid auth() config — ${summary}`, issues);
  }
  return {
    kind: "plumix",
    passkey: input.passkey,
    sessions: input.sessions,
    oauth: input.oauth,
  };
}
