import type { AppContext } from "../../context/app.js";
import type { PlumixApp } from "../../runtime/app.js";
import { EmailChangeError } from "./errors.js";
import { verifyEmailChange } from "./verify.js";

const LOGIN_PATH = "/_plumix/admin/login";

// Defensive bound on the inbound `token` query param. Same shape
// as magic-link's verify route — protects against pathological
// query strings.
const MAX_TOKEN_LENGTH = 256;

/**
 * GET `/_plumix/auth/verify-email?token=…`
 *
 * Top-level navigation from the user's email client. Consumes the
 * single-use email-change token, atomically commits the new email
 * + resets `emailVerifiedAt`, invalidates every session for the
 * affected user, and redirects to `/admin` (the user re-auths via
 * passkey / magic-link / OAuth using the new email).
 *
 * Errors redirect to `/admin/login` with a typed
 * `email_change_error=<code>` so the login screen can render
 * actionable copy.
 */
export async function handleEmailChangeVerify(
  ctx: AppContext,
  _app: PlumixApp,
): Promise<Response> {
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  if (!token) return loginError("missing_token");
  if (token.length > MAX_TOKEN_LENGTH) return loginError("token_invalid");

  let result: Awaited<ReturnType<typeof verifyEmailChange>>;
  try {
    result = await verifyEmailChange(ctx.db, token);
  } catch (error) {
    if (error instanceof EmailChangeError) {
      ctx.logger.warn("email_change_verify_rejected", { code: error.code });
      return loginError(error.code);
    }
    ctx.logger.error("email_change_verify_failed", { error });
    return loginError("token_invalid");
  }

  // The change is COMMITTED at this point — email + emailVerifiedAt
  // are written, sessions are invalidated, the token is consumed.
  // A throwing audit-log subscriber must NOT make us redirect to
  // `?email_change_error=…`: the user would type the old email on
  // the login screen while the row already moved. Log the hook
  // failure server-side and report success regardless. Same shape
  // applies to any "hook fires after a committed write" surface;
  // observers can record the outcome but can't fake it.
  try {
    await ctx.hooks.doAction("user:email_changed", result.user, {
      previousEmail: result.previousEmail,
    });
  } catch (error) {
    ctx.logger.error("email_change_hook_failed", { error });
  }
  return redirectTo(`${LOGIN_PATH}?email_change_success=1`);
}

function redirectTo(
  location: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ Location: location, ...extraHeaders });
  return new Response(null, { status: 302, headers });
}

function loginError(code: string): Response {
  const params = new URLSearchParams({ email_change_error: code });
  return redirectTo(`${LOGIN_PATH}?${params.toString()}`);
}
