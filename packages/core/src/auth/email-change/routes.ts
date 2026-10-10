import type { AppContext } from "../../context/app-context.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { EmailChangeErrorCode } from "./errors.js";
import { withBasePath } from "../../base-path.js";
import { loginErrorRedirect, redirectTo } from "../../runtime/contract/http.js";
import { resolveLoginPath } from "../config.js";
import { EmailChangeError } from "./errors.js";
import { verifyEmailChange } from "./verify.js";

// Defensive bound on the inbound `token` query param. Same shape
// as magic-link's verify route — protects against pathological
// query strings.
const MAX_TOKEN_LENGTH = 256;

/**
 * Invalidates every session of the user, so they sign in again with the new
 * email.
 */
export async function handleEmailChangeVerify(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  if (!token) return loginError(app, "missing_token");
  if (token.length > MAX_TOKEN_LENGTH) return loginError(app, "token_invalid");

  let result: Awaited<ReturnType<typeof verifyEmailChange>>;
  try {
    result = await verifyEmailChange(ctx.db, token);
  } catch (error) {
    if (error instanceof EmailChangeError) {
      ctx.logger.warn("email_change_verify_rejected", { code: error.code });
      return loginError(app, error.code);
    }
    ctx.logger.error("email_change_verify_failed", { error });
    return loginError(app, "token_invalid");
  }

  // The change is committed, so a throwing subscriber must not report an error
  // and send the user back to their old email.
  try {
    await ctx.hooks.doAction(
      "user:email_changed",
      result.user,
      {
        previousEmail: result.previousEmail,
      },
      ctx,
    );
  } catch (error) {
    ctx.logger.error("email_change_hook_failed", { error });
  }
  return redirectTo(`${loginPath(app)}?email_change_success=1`);
}

function loginError(app: AuthFlowApp, code: EmailChangeErrorCode): Response {
  return loginErrorRedirect(loginPath(app), "email_change_error", code);
}

function loginPath(app: AuthFlowApp): string {
  return withBasePath(resolveLoginPath(app.config.auth), app.config.basePath);
}
