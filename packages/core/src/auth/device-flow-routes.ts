import * as v from "valibot";

import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "../runtime/app.js";
import { jsonResponse } from "../runtime/http.js";
import { exchangeDeviceCode, requestDeviceCode } from "./device-flow.js";

// RFC 8628 §3.4 grant_type identifier.
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// Path that the CLI prints to the user. Lands on the admin SPA, which
// renders the approve flow at the same route. Keep aligned with the
// admin router's `/auth/device` page.
const VERIFICATION_PATH = "/_plumix/admin/auth/device";

// Default name applied to the minted token when the approver didn't
// type one — we do require it in the approval form, so this is just a
// belt-and-braces fallback for the row's payload.
const DEFAULT_TOKEN_NAME = "CLI";

// Defensive bound on the inbound `device_code` body field. Our generator
// emits 256-bit base64url (43 chars); 256 chars is generous for
// future-proofing while bounding malformed-poll amplification.
const MAX_DEVICE_CODE_LENGTH = 256;

const exchangeInputSchema = v.object({
  grant_type: v.literal(DEVICE_CODE_GRANT_TYPE),
  device_code: v.pipe(v.string(), v.maxLength(MAX_DEVICE_CODE_LENGTH)),
});

/**
 * POST /_plumix/auth/device/code — RFC 8628 §3.1.
 *
 * Public endpoint a CLI hits to begin a device-flow session. No body
 * required, no client auth, no caller identity. Returns the
 * device_code (machine-side polling secret) + user_code (human-typed
 * approval anchor) + the URI the human should visit to approve.
 *
 * Dispatcher's CSRF gate fires first (custom header + Origin check);
 * CLIs are not browsers and trivially set `X-Plumix-Request: 1`.
 */
export async function handleDeviceCodeRequest(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const { deviceCode, userCode, expiresIn, interval } = await requestDeviceCode(
    ctx.db,
  );

  const verificationUri = new URL(VERIFICATION_PATH, app.origin).toString();
  const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;

  return jsonResponse({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    expires_in: expiresIn,
    interval,
  });
}

/**
 * POST /_plumix/auth/device/token — RFC 8628 §3.4.
 *
 * Public endpoint the CLI polls until the human approves on the admin.
 * Standard OAuth 2.0 token-endpoint shape with the device-code grant.
 * Errors follow §3.5: `authorization_pending` while waiting,
 * `access_denied` if the human pressed Deny, `expired_token` past
 * the TTL, `invalid_grant` for unknown device_codes,
 * `invalid_request` for malformed bodies. We don't emit `slow_down`
 * — we don't track per-client cadence, the polling client just
 * keeps the spec-default 5s interval.
 */
export async function handleDeviceTokenExchange(
  ctx: AppContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return errorResponse("invalid_request");
  }
  const parsed = v.safeParse(exchangeInputSchema, body);
  if (!parsed.success) return errorResponse("invalid_request");

  const result = await exchangeDeviceCode(
    ctx.db,
    parsed.output.device_code,
    DEFAULT_TOKEN_NAME,
  );

  switch (result.outcome) {
    case "approved":
      return jsonResponse({
        access_token: result.secret,
        token_type: "Bearer",
      });
    case "pending":
      return errorResponse("authorization_pending");
    case "denied":
      return errorResponse("access_denied");
    case "expired":
      return errorResponse("expired_token");
    case "invalid":
      return errorResponse("invalid_grant");
  }
}

function errorResponse(error: string): Response {
  return jsonResponse({ error }, { status: 400 });
}
