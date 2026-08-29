import type { AppContext } from "plumix/plugin";
import { resolveEnvInput } from "plumix";
import * as v from "valibot";

import type { TurnstileConfig } from "../define-form.js";

/** Cloudflare's server-side check — see the Turnstile documentation. */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Failing closed only means anything if the check finishes: without this
// a siteverify that hangs holds the visitor's submission open until the
// platform kills the request, which is neither a pass nor a refusal.
const VERIFY_TIMEOUT_MS = 5000;

/**
 * What Cloudflare answers. Decoded rather than asserted: it arrives over
 * the network, where a captive portal, an intercepting proxy or an
 * outage all answer 200 with something that is not this.
 */
const SiteVerify = v.object({
  success: v.boolean(),
  "error-codes": v.optional(v.array(v.string())),
});

/**
 * Whether Cloudflare vouches for the challenge a visitor solved.
 *
 * It fails closed: a check that could not be made — Cloudflare
 * unreachable, a secret nobody configured, an answer that did not decode
 * — is not a check that passed. Every refusal reads the same to the
 * visitor and is retryable; which of them happened is in the log, where
 * the person who can fix it will look.
 *
 * The visitor's address is deliberately not sent: Cloudflare already saw
 * it when the widget ran, and this plugin keeps addresses hashed.
 */
export async function verifyTurnstile(
  ctx: AppContext,
  turnstile: TurnstileConfig,
  response: string | null,
): Promise<boolean> {
  // Nothing to check, and nothing worth a subrequest to check it with.
  if (response === null || response.length === 0) return false;

  // Falsy rather than empty: a secret declared in `wrangler.jsonc` but
  // never actually set types as a `string` and arrives `undefined`, and
  // a 500 on a public route is a worse answer to that than the refusal
  // every other unverifiable submission gets.
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
