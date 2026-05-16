import * as v from "valibot";

import type { AppContext } from "../../context/app.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { MagicLinkErrorCode } from "./errors.js";
import {
  jsonResponse,
  loginErrorRedirect,
  redirectTo,
} from "../../runtime/http.js";
import { mintSessionAndCookie } from "../sign-in.js";
import { MagicLinkError } from "./errors.js";
import { requestMagicLink } from "./request.js";
import { verifyMagicLink } from "./verify.js";

const ADMIN_PATH = "/_plumix/admin";
const LOGIN_PATH = "/_plumix/admin/login";

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
});

/**
 * POST /_plumix/auth/magic-link/request — JSON body `{ email }`.
 *
 * Always responds with 200 and a generic "If an account exists…"
 * message regardless of whether the recipient is registered. The
 * dispatcher's CSRF gate fires before this handler (custom header +
 * Origin check); we don't need additional CSRF here.
 */
export async function handleMagicLinkRequest(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  // 503 distinguishes "plumix doesn't have magic-link wired up" (operator
  // omission, should fail loudly) from "this email isn't registered"
  // (always-success contract, intentionally silent). Don't fold them.
  // The cross-field check in `plumix()` prevents `magicLink` from being
  // configured without a top-level mailer, so `ctx.mailer` is reliably
  // present here when `magicLink` is. Belt + braces: re-check both.
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
      origin: app.origin,
      mailer: ctx.mailer,
      siteName: app.config.auth.magicLink.siteName,
      ttlSeconds: app.config.auth.magicLink.ttlSeconds,
      logger: ctx.logger,
      bootstrapAllowed: ctx.bootstrapAllowed,
    });
  } catch (error) {
    // requestMagicLink swallows mailer errors internally; anything that
    // reaches here is a programming error (DB outage, etc.). The
    // always-success contract is non-negotiable — distinguishing
    // success from "DB blew up while looking up your email" would let
    // an attacker fingerprint the registered set via response codes.
    // Log server-side; respond identically.
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
 * redirect to /admin/login with a typed `magic_link_error=<code>`.
 */
export async function handleMagicLinkVerify(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  if (!app.config.auth.magicLink) {
    return loginError("token_invalid");
  }

  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  if (!token) return loginError("missing_token");
  if (token.length > MAX_TOKEN_LENGTH) return loginError("token_invalid");

  try {
    const { user, created } = await verifyMagicLink(ctx.db, token, {
      bootstrapAllowed: ctx.bootstrapAllowed,
    });
    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);
    await ctx.hooks.doAction("user:signed_in", user, {
      method: "magic_link",
      firstSignIn: created,
    });
    return redirectTo(ADMIN_PATH, { "set-cookie": cookieHeader });
  } catch (error) {
    if (error instanceof MagicLinkError) {
      ctx.logger.warn("magic_link_verify_rejected", { code: error.code });
      return loginError(error.code);
    }
    ctx.logger.error("magic_link_verify_failed", { error });
    return loginError("token_invalid");
  }
}

function invalidInput(): Response {
  return jsonResponse({ error: "invalid_input" }, { status: 400 });
}

function loginError(code: MagicLinkErrorCode): Response {
  return loginErrorRedirect(LOGIN_PATH, "magic_link_error", code);
}
