import * as v from "valibot";

import type { OAuthProvidersConfig } from "./oauth/types.js";
import type { PasskeyConfig } from "./passkey/config.js";
import type { SessionPolicy } from "./sessions.js";

export interface PlumixOAuthConfig {
  readonly providers: OAuthProvidersConfig;
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

const oauthClientSchema = v.object({
  clientId: v.pipe(
    v.string(),
    v.nonEmpty("clientId must be a non-empty string"),
  ),
  clientSecret: v.pipe(
    v.string(),
    v.nonEmpty("clientSecret must be a non-empty string"),
  ),
});

const oauthSchema = v.pipe(
  v.object({
    providers: v.object({
      github: v.optional(oauthClientSchema),
      google: v.optional(oauthClientSchema),
    }),
  }),
  v.check(
    (cfg) =>
      cfg.providers.github !== undefined || cfg.providers.google !== undefined,
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
