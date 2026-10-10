import type { AppContext } from "plumix/plugin";
import { resolveEnvInput } from "plumix";
import * as v from "valibot";

import type { TurnstileConfig } from "../define-form.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * A hung siteverify would hold the submission until the platform kills the
 * request.
 */
const VERIFY_TIMEOUT_MS = 5000;

/** Decoded: a proxy or outage can answer 200 with something else. */
const SiteVerify = v.object({
  success: v.boolean(),
  "error-codes": v.optional(v.array(v.string())),
});

/**
 * Fails closed; the cause goes to the log. The visitor's IP is
 * deliberately not sent.
 */
export async function verifyTurnstile(
  ctx: AppContext,
  turnstile: TurnstileConfig,
  response: string | null,
): Promise<boolean> {
  // Nothing to check, and nothing worth a subrequest to check it with.
  if (response === null || response.length === 0) return false;

  // A declared but unset secret types as `string` yet arrives `undefined`.
  const secret = resolveEnvInput(turnstile.secret, ctx.env);
  if (!secret) {
    ctx.logger.error("forms: a form's Turnstile secret resolved to nothing", {
      siteKey: turnstile.siteKey,
    });
    return false;
  }

  try {
    const answer = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const decoded = v.safeParse(SiteVerify, await answer.json());
    if (!decoded.success) {
      ctx.logger.error("forms: Turnstile answered something unrecognisable", {
        status: answer.status,
      });
      return false;
    }
    if (!decoded.output.success) {
      ctx.logger.warn("forms: Turnstile refused a challenge", {
        codes: decoded.output["error-codes"],
      });
    }
    return decoded.output.success;
  } catch (error) {
    ctx.logger.error("forms: verifying a Turnstile challenge failed", {
      error,
    });
    return false;
  }
}
