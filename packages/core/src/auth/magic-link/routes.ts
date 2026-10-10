import * as v from "valibot";

import type { AppContext } from "../../context/app-context.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { MagicLinkErrorCode } from "./errors.js";
import { withBasePath } from "../../base-path.js";
import { startingMeta } from "../../plugin/fields/starting-meta.js";
import { listUserMetaFields } from "../../plugin/manifest.js";
import {
  jsonResponse,
  loginErrorRedirect,
  redirectTo,
} from "../../runtime/contract/http.js";
import { resolveLoginPath } from "../config.js";
import { isSafeRedirect, resolveSafeRedirect } from "../redirect.js";
import { announceSignIn, mintSessionAndCookie } from "../sign-in.js";
import { MagicLinkError } from "./errors.js";
import { requestMagicLink } from "./request.js";
import { verifyMagicLink } from "./verify.js";

const ADMIN_PATH = "/_plumix/admin";

// Defensive bound on the inbound `token` query param. Our generator
// emits 192-bit base64url (32 chars); 256 chars is generous for
// future-proofing while bounding malformed-callback amplification.
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
  // email. Accepted as a bounded string here; `isSafeRedirect` is the real
  // gate before it's folded into the emailed link.
  redirectTo: v.optional(v.pipe(v.string(), v.maxLength(2048))),
});

/**
 * Always 200 with a generic message, registered or not. The dispatcher's CSRF
 * gate runs first.
 */
export async function handleMagicLinkRequest(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  // A missing config is an operator omission and fails loudly, unlike the
  // silent unknown-email path.
  if (!app.config.auth.magicLink || !ctx.mailer) {
    return jsonResponse(
      { error: "magic_link_not_configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return invalidInput();
  }
  const parsed = v.safeParse(requestInputSchema, body);
  if (!parsed.success) return invalidInput();

  try {
    await requestMagicLink(ctx.db, {
      email: parsed.output.email,
      // Drop an unsafe destination now so it never reaches the email. The
      // verify route re-validates the surviving value as the trust boundary.
      redirectTo: isSafeRedirect(parsed.output.redirectTo)
        ? parsed.output.redirectTo
        : undefined,
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

  return jsonResponse({
    ok: true,
    message: "If an account exists for this email, we sent a sign-in link.",
  });
}

/**
 * GET /_plumix/auth/magic-link/verify?token=…
 *
 * Top-level navigation from the user's email client; consumes the
 * single-use token, mints a session, redirects to /admin. Errors
 * redirect to `auth.loginPath` with a typed `magic_link_error=<code>`.
 */
export async function handleMagicLinkVerify(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  if (!app.config.auth.magicLink) {
    return loginError(app, "token_invalid");
  }

  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  if (!token) return loginError(app, "missing_token");
  if (token.length > MAX_TOKEN_LENGTH) return loginError(app, "token_invalid");

  try {
    const { user, created } = await verifyMagicLink(ctx.db, token, {
      bootstrapAllowed: ctx.bootstrapAllowed,
      selfSignup: app.config.auth.selfSignup,
      meta: startingMeta(listUserMetaFields(ctx.plugins)),
    });
    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);
    await announceSignIn(ctx, user, {
      method: "magic_link",
      firstSignIn: created,
    });
    // Honour a safe return-to path that rode through the emailed link;
    // otherwise the admin, as before.
    const destination = resolveSafeRedirect(
      url.searchParams.get("redirectTo"),
      withBasePath(ADMIN_PATH, app.config.basePath),
    );
    return redirectTo(destination, {
      "set-cookie": cookieHeader,
    });
  } catch (error) {
    if (error instanceof MagicLinkError) {
      ctx.logger.warn("magic_link_verify_rejected", { code: error.code });
      return loginError(app, error.code);
    }
    ctx.logger.error("magic_link_verify_failed", { error });
    return loginError(app, "token_invalid");
  }
}

function invalidInput(): Response {
  return jsonResponse({ error: "invalid_input" }, { status: 400 });
}

function loginError(app: AuthFlowApp, code: MagicLinkErrorCode): Response {
  return loginErrorRedirect(
    withBasePath(resolveLoginPath(app.config.auth), app.config.basePath),
    "magic_link_error",
    code,
  );
}
