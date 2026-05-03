import type { Db, Logger } from "../../context/app.js";
import type { Mailer } from "../mailer/types.js";
import { eq } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
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

interface RequestMagicLinkInput {
  readonly email: string;
  /** `${origin}/_plumix/admin/magic-link?token=…` will be sent to the user. */
  readonly origin: string;
  readonly mailer: Mailer;
  readonly siteName: string;
  readonly ttlSeconds?: number;
  /**
   * Optional logger for swallowed mailer errors. The function never
   * throws (so the response can stay shape-identical on every code
   * path), but a transport failure is still operator-visible signal —
   * route this through the request logger when one is available.
   */
  readonly logger?: Pick<Logger, "warn">;
  /**
   * When true, allow this magic-link request to issue a signup token
   * even when zero users exist. The route reads this from
   * `ctx.bootstrapAllowed` (derived from `auth.bootstrapVia`); default
   * false keeps the bootstrap rail passkey-only.
   */
  readonly bootstrapAllowed?: boolean;
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

  // Signup path — no user yet. Gate on allowed_domains + non-zero
  // user count so the bootstrap-via-passkey rule holds.
  const domain = extractDomain(email);
  if (!domain) {
    await timingDelay();
    return;
  }
  const allowed = await db.query.allowedDomains.findFirst({
    where: eq(allowedDomains.domain, domain),
  });
  if (!allowed?.isEnabled) {
    await timingDelay();
    return;
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

  const verifyUrl = new URL("/_plumix/auth/magic-link/verify", input.origin);
  verifyUrl.searchParams.set("token", token);

  try {
    // Plain-text body only. Branded HTML / template rendering is the
    // operator's call — they wrap their `Mailer` adapter and template
    // however they like. Plumix is not in the email-design business.
    await input.mailer.send({
      to: target.email,
      subject: `Sign in to ${input.siteName}`,
      text: composeText(input.siteName, verifyUrl.toString(), ttlSeconds),
    });
  } catch (error) {
    // Swallow toward the caller — surfacing this would leak that the
    // recipient is registered. Log it server-side so the operator sees
    // the failure (otherwise broken mail config would be silent).
    input.logger?.warn("magic_link_mailer_failed", { error });
  }
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function composeText(
  siteName: string,
  url: string,
  ttlSeconds: number,
): string {
  return [
    `Sign in to ${siteName} by opening this link:`,
    "",
    url,
    "",
    `The link expires in ${Math.round(ttlSeconds / 60)} minutes.`,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
}

function timingDelay(): Promise<void> {
  const ms = TIMING_DELAY_MIN_MS + Math.random() * TIMING_DELAY_RANGE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
