import * as v from "valibot";

import type {
  PlumixAuthConfig,
  PlumixAuthInput,
} from "../context/auth-config.js";
import type { EnvInput } from "../runtime/contract/env-input.js";
import { USER_ROLES } from "../db/schema/users.js";
import { OAUTH_PROVIDER_KEY_PATTERN } from "./contract/oauth.js";
import { HTTPS_WILDCARD_PREFIX } from "./passkey/origin-policy.js";
import { isSafeRedirect } from "./redirect.js";

// The `./auth` subpath's entry. The shapes live beside the context, which
// names their `RequestAuthenticator`.
export type {
  BootstrapVia,
  PlumixAuthConfig,
  PlumixAuthInput,
  PlumixMagicLinkConfig,
  PlumixOAuthConfig,
  PlumixSelfSignupConfig,
} from "../context/auth-config.js";

export interface PlumixConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class PlumixConfigError extends Error {
  static {
    PlumixConfigError.prototype.name = "PlumixConfigError";
  }

  readonly code: "invalid_auth_config";
  readonly issues: readonly PlumixConfigIssue[];

  private constructor(
    code: "invalid_auth_config",
    message: string,
    issues: readonly PlumixConfigIssue[],
  ) {
    super(message);
    this.code = code;
    this.issues = issues;
  }

  static invalidAuthConfig(ctx: {
    issues: readonly PlumixConfigIssue[];
  }): PlumixConfigError {
    const summary = ctx.issues
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join("; ");
    return new PlumixConfigError(
      "invalid_auth_config",
      `Invalid auth() config — ${summary}`,
      ctx.issues,
    );
  }
}

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null;

const isNonEmptyString = (val: unknown): boolean =>
  typeof val === "string" && val.length > 0;

const hasNonEmptyString = (val: unknown, key: string): boolean =>
  isPlainObject(val) && isNonEmptyString(val[key]);

// The host an allowedOrigins entry accepts: the base of a `https://*.base`
// wildcard, or the hostname of an exact https origin. null for anything the
// runtime matcher could never honor — non-https, a nested wildcard, or (for an
// exact entry) any form other than a bare origin, since `originAllowed` matches
// exact entries by full-string equality.
function allowedOriginHost(entry: string): string | null {
  if (entry.startsWith(HTTPS_WILDCARD_PREFIX)) {
    const base = entry.slice(HTTPS_WILDCARD_PREFIX.length);
    return base.length > 0 && !base.includes("/") && !base.includes("*")
      ? base
      : null;
  }
  try {
    const url = new URL(entry);
    if (url.protocol !== "https:" || url.origin !== entry) return null;
    return url.hostname;
  } catch {
    return null;
  }
}

const isRpIdSuffix = (host: string, rpId: string): boolean =>
  host === rpId || host.endsWith(`.${rpId}`);

const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

// origin / allowedOrigins accept an `(env) => …` resolver (validated at runtime,
// like secret slots) or a literal validated here. A bare `v.custom` per field
// keeps the error message precise — a `v.union` would collapse it.
const passkeySchema = v.pipe(
  v.object({
    rpName: v.pipe(v.string(), v.nonEmpty("rpName must be a non-empty string")),
    rpId: v.pipe(v.string(), v.nonEmpty("rpId must be a non-empty string")),
    origin: v.custom<EnvInput<string>>(
      (val) =>
        typeof val === "function" || (typeof val === "string" && isUrl(val)),
      "origin must be a valid URL or an (env) => string resolver",
    ),
    allowedOrigins: v.optional(
      v.custom<EnvInput<readonly string[]>>(
        (val) => typeof val === "function" || isStringArray(val),
        "allowedOrigins must be a string[] or an (env) => string[] resolver",
      ),
    ),
  }),
  // Cross-field: every literal accepted origin must keep rpId as a registrable
  // suffix, so a credential bound to rpId stays valid on it. Resolver forms are
  // deferred to runtime. Forwarded onto the allowedOrigins path so the issue
  // points at the offending field.
  v.forward(
    v.check(
      (cfg) =>
        typeof cfg.allowedOrigins === "function" ||
        cfg.allowedOrigins === undefined ||
        cfg.allowedOrigins.every((entry) => {
          const host = allowedOriginHost(entry);
          return host !== null && isRpIdSuffix(host, cfg.rpId);
        }),
      "allowedOrigins entries must be an https origin (or https://*.subdomain wildcard) whose host is rpId or a subdomain of it",
    ),
    ["allowedOrigins"],
  ),
);

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
  // Literal credentials, or an `(env) => OAuthClientConfig` resolver (the
  // secret is read from the request env at token exchange). A resolver's
  // return is validated at use, not here — env isn't available at config
  // time — so the field checks below short-circuit for functions. A bare
  // pipe (not `v.union`) keeps the literal path's field errors precise:
  // a union would collapse them into "Expected (Object | unknown)".
  client: v.pipe(
    v.unknown(),
    v.check(
      (val) => typeof val === "function" || isPlainObject(val),
      "client must be an { clientId, clientSecret } object or an (env) => … resolver",
    ),
    v.check(
      (val) => typeof val === "function" || hasNonEmptyString(val, "clientId"),
      "clientId must be non-empty",
    ),
    v.check(
      (val) =>
        typeof val === "function" || hasNonEmptyString(val, "clientSecret"),
      "clientSecret must be non-empty",
    ),
  ),
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

const magicLinkSchema = v.object({
  siteName: v.pipe(
    v.string(),
    v.nonEmpty("siteName must be non-empty"),
    // Defense-in-depth: siteName flows into the email Subject header. Today
    // it's operator config (not request input) so safe, but if a future
    // settings UI ever lets it become user-input, blocking CR/LF here
    // prevents header injection at the boundary.
    v.regex(/^[^\r\n]+$/, "siteName must not contain newlines"),
  ),
  ttlSeconds: v.optional(
    v.pipe(
      v.number(),
      v.integer("ttlSeconds must be an integer"),
      v.minValue(60, "ttlSeconds must be ≥ 60"),
      v.maxValue(60 * 60, "ttlSeconds must be ≤ 3600"),
    ),
  ),
});

const selfSignupSchema = v.object({
  defaultRole: v.picklist(
    USER_ROLES,
    "selfSignup.defaultRole must be a valid user role",
  ),
});

const authInputSchema = v.object({
  passkey: passkeySchema,
  sessions: v.optional(sessionPolicySchema),
  oauth: v.optional(oauthSchema),
  magicLink: v.optional(magicLinkSchema),
  bootstrapVia: v.optional(v.picklist(["passkey", "first-method-wins"])),
  selfSignup: v.optional(selfSignupSchema),
  loginPath: v.optional(
    // Reuse the single redirect trust boundary rather than a second, weaker
    // regex: rejects protocol-relative (`//…`), backslashes, control chars,
    // absolute URLs, and over-length values — the same guard the flows run a
    // request `redirectTo` through before honouring it.
    v.pipe(
      v.string(),
      v.check(
        (value) => isSafeRedirect(value),
        "loginPath must be a safe root-relative path (no //, backslash, absolute URL, or control chars)",
      ),
    ),
  ),
} satisfies { readonly [K in keyof PlumixAuthInput]?: v.GenericSchema });

// Where a sign-in redirect sends a visitor when the operator sets no override.
const DEFAULT_LOGIN_PATH = "/_plumix/admin/login";

/** The configured login path, defaulting to the admin login. */
export function resolveLoginPath(auth: PlumixAuthConfig): string {
  return auth.loginPath ?? DEFAULT_LOGIN_PATH;
}

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
    throw PlumixConfigError.invalidAuthConfig({ issues });
  }
  return { ...input, kind: "plumix" };
}
