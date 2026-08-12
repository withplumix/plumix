import type { Db, Logger } from "../../context/app.js";
import type { Mailer } from "../mailer/types.js";
import { withBasePath } from "../../base-path.js";
import { and, eq, gte } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { emailStringsFor } from "../email/messages.js";
import { extractDomain } from "../identity.js";
import { generateToken, hashToken } from "../tokens.js";

// 15-minute default — the Copenhagen Book / emdash convention for
// passwordless sign-in tokens. Long enough to survive normal email
// delivery, short enough that a stolen / leaked link is mostly stale.
// Operators can lower via `auth.magicLink.ttlSeconds` (60–3600).
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

// Artificial delay range when the recipient is unknown — adds enough
// jitter that response timing alone can't tell a registered email apart
// from an unregistered one. The 100-250ms band approximates the cost
// of token generation + the mailer round-trip on the happy path.
const TIMING_DELAY_MIN_MS = 100;
const TIMING_DELAY_RANGE_MS = 150;

// Abuse cap: the most magic-link tokens a single email may be issued
// within the rolling window below. Open self-signup turns this endpoint
// into a public signup surface, so without a ceiling it becomes an
// email-bomb amplifier (real sends to attacker-chosen addresses). The cap
// is enforced on the sign-in issuance path too, so it can't be turned
// into a probe for which addresses are registered. Counting the token
// rows themselves (single-use, deleted on verify) needs no separate
// counter store — the same dependency-free approach the comments plugin's
// limiter uses. Generous enough that a user retrying past a spam filter
// never trips it; volumetric per-IP limiting is the edge/runtime's job.
const MAGIC_LINK_MAX_PER_WINDOW = 5;
const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;

interface RequestMagicLinkInput {
  readonly email: string;
  /** `${origin}/_plumix/admin/magic-link?token=…` will be sent to the user. */
  readonly origin: string;
  /** Subdirectory prefix the verify link must carry (`""` at the root). */
  readonly basePath: string;
  readonly mailer: Mailer;
  readonly siteName: string;
  readonly ttlSeconds?: number;
  /**
   * Locale for the email body. Pre-auth flow: caller supplies the
   * resolved admin-shell locale (Accept-Language fallback chain) since
   * the recipient has no stored preference yet. Falls back to English
   * when omitted or unknown. See `auth/email/messages.ts`.
   */
  readonly locale?: string;
  /**
   * Optional logger for swallowed mailer errors. The function never
   * throws (so the response can stay shape-identical on every code
   * path), but a transport failure is still operator-visible signal —
   * route this through the request logger when one is available.
   */
  readonly logger?: Pick<Logger, "warn">;
  /**
   * Validated same-origin path to fold into the emailed verify URL so a
   * theme-originated sign-in returns the visitor to where they started. The
   * caller passes only a value it has already run through `isSafeRedirect`;
   * the verify route re-validates the query param before honouring it.
   * Omitted for admin sign-in (verify defaults to the admin).
   */
  readonly redirectTo?: string;
  /**
   * When true, allow this magic-link request to issue a signup token
   * even when zero users exist. The route reads this from
   * `ctx.bootstrapAllowed` (derived from `auth.bootstrapVia`); default
   * false keeps the bootstrap rail passkey-only.
   */
  readonly bootstrapAllowed?: boolean;
  /**
   * Open self-signup. When true, a signup token is issued for any
   * syntactically valid email regardless of `allowed_domains` (the verify
   * route grants `auth.selfSignup.defaultRole`). When false (default),
   * signup stays gated to the domain allowlist. The bootstrap rail and
   * the per-email issuance cap apply either way.
   */
  readonly selfSignupOpen?: boolean;
}

/**
 * Issue a magic-link for sign-in or domain-gated signup.
 *
 *   sign-in (existing user)        → token row carries `userId = user.id`.
 *   signup (allowed-domain match)  → token row carries `userId = null`,
 *                                    role omitted (resolved at verify).
 *   neither                        → silent no-op + timing delay.
 *
 * Always behaves identically from the caller's perspective regardless of
 * which branch fired — the route layer turns this into an "If an
 * account exists or self-signup is open, we sent you a link" response.
 * Per Copenhagen Book / emdash: don't reveal email existence via
 * response timing or shape; honour that here at the function boundary.
 *
 * Bootstrap rail: signup is refused when the system has zero users
 * (matches OAuth — first-admin must enrol via passkey).
 *
 * Errors from the mailer are swallowed (logged via input.logger when
 * present). The function never throws; it returns normally regardless
 * of outcome.
 */
export async function requestMagicLink(
  db: Db,
  input: RequestMagicLinkInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const ttlSeconds = input.ttlSeconds ?? MAGIC_LINK_TTL_SECONDS;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // Sign-in path — existing active user.
  if (user && !user.disabledAt) {
    await issueAndSend(db, input, ttlSeconds, {
      userId: user.id,
      email: user.email,
    });
    return;
  }
  if (user?.disabledAt) {
    // Disabled user: no signup attempt, silent no-op + jitter.
    await timingDelay();
    return;
  }

  // Signup path — no user yet. A syntactically valid domain is required
  // either way (the verify route re-derives the role); with open
  // self-signup the allowlist is skipped, otherwise the domain must be
  // enabled in `allowed_domains`.
  const domain = extractDomain(email);
  if (!domain) {
    await timingDelay();
    return;
  }
  if (!input.selfSignupOpen) {
    const allowed = await db.query.allowedDomains.findFirst({
      where: eq(allowedDomains.domain, domain),
    });
    if (!allowed?.isEnabled) {
      await timingDelay();
      return;
    }
  }
  if (!input.bootstrapAllowed) {
    const userCount = await db.$count(users);
    if (userCount === 0) {
      // Refuse signup before bootstrap completes. Same rail OAuth uses.
      await timingDelay();
      return;
    }
  }

  await issueAndSend(db, input, ttlSeconds, { userId: null, email });
}

interface IssueAndSendInput {
  readonly userId: number | null;
  readonly email: string;
}

async function issueAndSend(
  db: Db,
  input: RequestMagicLinkInput,
  ttlSeconds: number,
  target: IssueAndSendInput,
): Promise<void> {
  if (await issuanceCapReached(db, target.email)) {
    // Over the per-email cap — behave exactly like the other silent
    // no-op branches (jitter, no send) so a throttled request is
    // indistinguishable from an unknown-email one.
    await timingDelay();
    return;
  }

  const token = generateToken();
  const hash = await hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(authTokens).values({
    hash,
    userId: target.userId,
    email: target.email,
    type: "magic_link",
    expiresAt,
  });

  const verifyUrl = new URL(
    withBasePath("/_plumix/auth/magic-link/verify", input.basePath),
    input.origin,
  );
  verifyUrl.searchParams.set("token", token);
  // Ride the return-to destination through the emailed link. Set only when
  // the caller supplied one it already validated — the verify route checks
  // it again on the way out.
  if (input.redirectTo !== undefined) {
    verifyUrl.searchParams.set("redirectTo", input.redirectTo);
  }

  try {
    // Plain-text body only. Branded HTML / template rendering is the
    // operator's call — they wrap their `Mailer` adapter and template
    // however they like. Plumix is not in the email-design business.
    const strings = emailStringsFor(input.locale);
    await input.mailer.send({
      to: target.email,
      subject: strings.magicLink.subject(input.siteName),
      text: strings.magicLink.body(
        input.siteName,
        verifyUrl.toString(),
        ttlSeconds,
      ),
    });
  } catch (error) {
    // Swallow toward the caller — surfacing this would leak that the
    // recipient is registered. Log it server-side so the operator sees
    // the failure (otherwise broken mail config would be silent).
    input.logger?.warn("magic_link_mailer_failed", { error });
  }
}

/** Whether `email` is at or over its magic-link cap for the window. */
async function issuanceCapReached(db: Db, email: string): Promise<boolean> {
  const since = new Date(Date.now() - MAGIC_LINK_WINDOW_MS);
  const recent = await db.$count(
    authTokens,
    and(
      eq(authTokens.email, email),
      eq(authTokens.type, "magic_link"),
      gte(authTokens.createdAt, since),
    ),
  );
  return recent >= MAGIC_LINK_MAX_PER_WINDOW;
}

function timingDelay(): Promise<void> {
  const ms = TIMING_DELAY_MIN_MS + Math.random() * TIMING_DELAY_RANGE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
