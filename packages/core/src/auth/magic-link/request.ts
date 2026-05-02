import type { Db, Logger } from "../../context/app.js";
import type { Mailer } from "../mailer/types.js";
import { eq } from "../../db/index.js";
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
}

/**
 * Issue a magic-link if (and only if) a user with this email exists.
 * Always behaves identically from the caller's perspective regardless of
 * whether the recipient is registered — the route layer turns this into
 * an "If an account exists, we sent you a link" response. Per Copenhagen
 * Book / emdash: don't reveal email existence via response timing or
 * shape; honour that here at the function boundary.
 *
 * Errors from the mailer are swallowed (logged at the route layer if
 * the caller wires logging in). The function never throws; it returns
 * normally regardless of outcome. Sign-in only — does not provision new
 * users; an unknown email is a silent no-op.
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

  if (!user || user.disabledAt) {
    await timingDelay();
    return;
  }

  const token = generateToken();
  const hash = await hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(authTokens).values({
    hash,
    userId: user.id,
    email: user.email,
    type: "magic_link",
    expiresAt,
  });

  const verifyUrl = new URL("/_plumix/auth/magic-link/verify", input.origin);
  verifyUrl.searchParams.set("token", token);

  try {
    await input.mailer.send({
      to: user.email,
      subject: `Sign in to ${input.siteName}`,
      text: composeText(input.siteName, verifyUrl.toString()),
      html: composeHtml(input.siteName, verifyUrl.toString()),
    });
  } catch (error) {
    // Swallow toward the caller — surfacing this would leak that the
    // recipient is registered. Log it server-side so the operator sees
    // the failure (otherwise broken mail config would be silent).
    input.logger?.warn("magic_link_mailer_failed", { error });
  }
}

function composeText(siteName: string, url: string): string {
  return [
    `Sign in to ${siteName} by opening this link:`,
    "",
    url,
    "",
    `The link expires in ${MAGIC_LINK_TTL_SECONDS / 60} minutes.`,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
}

function composeHtml(siteName: string, url: string): string {
  const safeName = escapeHtml(siteName);
  // The URL is server-generated (origin from app.origin + token from our
  // crypto-random generator), so it's already HTML-safe. Still, route it
  // through escapeHtml for defense-in-depth.
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#333;max-width:600px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">Sign in to ${safeName}</h1>
<p>Click the button below to sign in:</p>
<p style="margin:24px 0">
  <a href="${safeUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block">Sign in</a>
</p>
<p style="color:#666;font-size:14px">The link expires in ${MAGIC_LINK_TTL_SECONDS / 60} minutes.</p>
<p style="color:#666;font-size:14px">If you didn't request this, you can ignore this email.</p>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timingDelay(): Promise<void> {
  const ms = TIMING_DELAY_MIN_MS + Math.random() * TIMING_DELAY_RANGE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
