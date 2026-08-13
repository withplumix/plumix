import * as v from "valibot";

import type { UserRole } from "../db/schema/users.js";
import type { EnvInput } from "../runtime/env-input.js";
import type { RequestAuthenticator } from "./authenticator.js";
import type { OAuthProviderClient } from "./oauth/types.js";
import type { PasskeyConfig } from "./passkey/config.js";
import type { SessionPolicy } from "./sessions.js";
import { USER_ROLES } from "../db/schema/users.js";
import { OAUTH_PROVIDER_KEY_PATTERN } from "./oauth/types.js";
import { HTTPS_WILDCARD_PREFIX } from "./passkey/origin-policy.js";
import { isSafeRedirect } from "./redirect.js";

export interface PlumixMagicLinkConfig {
  /**
   * Site name shown in the email subject + body ("Sign in to {siteName}").
   * Required so the operator picks the user-visible string explicitly —
   * the alternative (silently falling back to `passkey.rpName`) couples
   * config blocks in a non-obvious way.
   */
  readonly siteName: string;
  /**
   * Token lifetime in seconds. Defaults to 15 minutes (900) — the
   * Copenhagen Book / emdash convention. Lower for paranoid deploys.
   */
  readonly ttlSeconds?: number;
}

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

export type BootstrapVia = "passkey" | "first-method-wins";

export interface PlumixSelfSignupConfig {
  /**
   * Role every self-provisioned user is granted. Present = open
   * self-signup: the built-in magic-link and OAuth signup paths stop
   * consulting `allowed_domains` and mint new users at this role
   * directly. Absent (default) = today's domain-gated behaviour.
   *
   * Kept explicit — never defaulted — because it decides how much
   * authority "anyone with an email" receives. `"subscriber"` is the
   * intended choice (authenticated but off the admin capability ladder);
   * a privileged role here hands the admin to the public, so the
   * operator states it deliberately.
   *
   * Note the allowlist is bypassed wholesale, not merged: while open,
   * even an email whose domain has an `allowed_domains` rule granting a
   * higher role is provisioned at `defaultRole`. Per-inbox abuse limits
   * are the edge/runtime's job — the built-in per-email issuance cap
   * bounds one address, not aliases of it (`user+tag@…`) or account
   * volume across many addresses.
   */
  readonly defaultRole: UserRole;
}

export interface PlumixAuthInput {
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
  readonly magicLink?: PlumixMagicLinkConfig;
  /**
   * Request-level guard. Decides "who is this user" on every request.
   * Defaults to `defaultAuthenticator()` — a chain of
   * `sessionAuthenticator()` (cookie) followed by
   * `apiTokenAuthenticator()` (Authorization: Bearer pl_pat_…).
   * Browser admins and CLI / MCP clients both authenticate out of
   * the box without operator config.
   *
   * Override for transparent SSO — e.g. `cfAccess({ teamDomain })` from
   * `@plumix/runtime-cloudflare`, where the edge sets a JWT header on
   * every request. The built-in login routes (passkey / oauth /
   * magic-link) remain mounted regardless: operators that want them
   * disabled when an external authenticator owns the session should
   * firewall `/_plumix/auth/*` at the edge (e.g. a Cloudflare Access
   * policy on those paths). Leaving them live by default supports
   * deploys that mix transparent SSO with passkey-as-backup.
   *
   * If you override and still want bearer-token auth alongside, wrap
   * yours in `chainAuthenticators(yourGuard, apiTokenAuthenticator())`.
   */
  readonly authenticator?: RequestAuthenticator;
  /**
   * How the very first admin enrols on a fresh deploy.
   *
   * - `"passkey"` (default) — magic-link and OAuth signup are refused
   *   while the users table is empty. The first admin must enrol via
   *   the dedicated passkey bootstrap rail. Phishing-resistant; no
   *   external dependency.
   *
   * - `"first-method-wins"` — any verified external flow (magic-link,
   *   OAuth, custom authenticator) can mint the first admin via the
   *   atomic CASE-WHEN-COUNT election in `provisionUser`. Use when the
   *   runtime layer already gates who reaches plumix (Cloudflare Access
   *   in front, SAML at the edge, internal-only deploy) — the gate is
   *   "can the JWT be issued at all", not "can plumix see any user".
   */
  readonly bootstrapVia?: BootstrapVia;
  /**
   * Open public registration (see {@link PlumixSelfSignupConfig}). Omit
   * (default) to keep signup gated to `allowed_domains`. Enabling it turns
   * the magic-link request endpoint into a public signup surface, so
   * issuance stays rate-limited and timing-uniform underneath.
   */
  readonly selfSignup?: PlumixSelfSignupConfig;
  /**
   * Where an access policy's `redirectToLogin()` sends an anonymous visitor.
   * A root-relative path; the framework appends `?redirectTo=<current URL>` so
   * the honouring sign-in flow returns the visitor afterwards. Defaults to the
   * admin login (`/_plumix/admin/login`) — set it to a theme-owned login page
   * so gated visitors sign in on the site rather than in the CMS.
   */
  readonly loginPath?: string;
}

export interface PlumixAuthConfig {
  readonly kind: "plumix";
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
  readonly magicLink?: PlumixMagicLinkConfig;
  readonly authenticator?: RequestAuthenticator;
  readonly bootstrapVia?: BootstrapVia;
  readonly selfSignup?: PlumixSelfSignupConfig;
  readonly loginPath?: string;
}

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

const field = (val: unknown, key: string): unknown =>
  isPlainObject(val) ? val[key] : undefined;

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
      (val) =>
        typeof val === "function" || isNonEmptyString(field(val, "clientId")),
      "clientId must be non-empty",
    ),
    v.check(
      (val) =>
        typeof val === "function" ||
        isNonEmptyString(field(val, "clientSecret")),
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
    throw PlumixConfigError.invalidAuthConfig({ issues });
  }
  return {
    kind: "plumix",
    passkey: input.passkey,
    sessions: input.sessions,
    oauth: input.oauth,
    magicLink: input.magicLink,
    authenticator: input.authenticator,
    bootstrapVia: input.bootstrapVia,
    selfSignup: input.selfSignup,
    loginPath: input.loginPath,
  };
}
