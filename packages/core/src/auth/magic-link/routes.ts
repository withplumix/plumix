import * as v from "valibot";

import type { AuthMethodKernel } from "../../plugin/auth-method.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { MagicLinkErrorCode } from "./errors.js";
import type { MagicLinkHolder } from "./verify.js";
import { MagicLinkError } from "./errors.js";
import { requestMagicLink } from "./request.js";
import { consumeMagicLinkToken } from "./verify.js";

/**
 * Defensive bound on the inbound `token` query param. Our generator
 * emits 192-bit base64url (32 chars); 256 chars is generous for
 * future-proofing while bounding malformed-callback amplification.
 */
const MAX_TOKEN_LENGTH = 256;

const requestInputSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email(),
    v.maxLength(255),
  ),
  // Optional return-to destination a theme login page sends alongside the
  // email; `readRedirectTo` validates it before it's folded into the link.
  redirectTo: v.optional(v.pipe(v.string(), v.maxLength(2048))),
});

type MagicLinkKernel = AuthMethodKernel<MagicLinkErrorCode>;

/**
 * The same notice, registered or not. The dispatcher's CSRF gate runs first.
 */
export async function handleMagicLinkRequest(
  auth: MagicLinkKernel,
  app: AuthFlowApp,
): Promise<Response> {
  const { ctx } = auth;
  // A missing config is an operator omission and fails loudly, unlike the
  // silent unknown-email path.
  if (!app.config.auth.magicLink || !ctx.mailer) {
    return auth.fail("magic_link_not_configured", { status: 503 });
  }

  const parsed = v.safeParse(requestInputSchema, await auth.readInput());
  if (!parsed.success) return auth.fail("invalid_input");

  try {
    await requestMagicLink(ctx.db, {
      email: parsed.output.email,
      redirectTo: auth.readRedirectTo(parsed.output.redirectTo),
      origin: ctx.origin,
      basePath: app.config.basePath,
      // A new address has no stored locale, so `ctx.mail` falls back to the
      // request's: the login form's `?lang=` or `plumix_locale` pick.
      mail: ctx.mail,
      ttlSeconds: app.config.auth.magicLink.ttlSeconds,
      logger: ctx.logger,
      bootstrapAllowed: ctx.bootstrapAllowed,
      // Open self-signup lets any valid email register; the verify route
      // grants `auth.selfSignup.defaultRole`. Absent = domain-gated.
      selfSignupOpen: app.config.auth.selfSignup !== undefined,
    });
  } catch (error) {
    // Respond identically: a distinct error code would let an attacker
    // fingerprint registered emails.
    ctx.logger.error("magic_link_request_failed", { error });
  }

  return auth.notice("sent", {
    ok: true,
    message: "If an account exists for this email, we sent a sign-in link.",
  });
}

/**
 * GET /_plumix/auth/magic-link/verify?token=…
 *
 * Top-level navigation from the user's email client; consumes the
 * single-use token and signs its holder in.
 */
export async function handleMagicLinkVerify(
  auth: MagicLinkKernel,
  app: AuthFlowApp,
): Promise<Response> {
  if (!app.config.auth.magicLink) return auth.fail("token_invalid");

  const token = new URL(auth.request.url).searchParams.get("token");
  if (!token) return auth.fail("missing_token");
  if (token.length > MAX_TOKEN_LENGTH) return auth.fail("token_invalid");

  let holder: MagicLinkHolder;
  try {
    holder = await consumeMagicLinkToken(auth.ctx.db, token);
  } catch (error) {
    if (error instanceof MagicLinkError) {
      auth.ctx.logger.warn("magic_link_verify_rejected", { code: error.code });
      return auth.fail(error.code);
    }
    auth.ctx.logger.error("magic_link_verify_failed", { error });
    return auth.fail("token_invalid");
  }
  // The link click is the proof of the inbox.
  return "userId" in holder
    ? auth.proveIdentity({ userId: holder.userId })
    : auth.proveIdentity({ email: holder.email, emailVerified: true });
}
