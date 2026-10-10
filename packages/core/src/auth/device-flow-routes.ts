import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import type { AuthFlowApp } from "./flow-app.js";
import { withBasePath } from "../base-path.js";
import { jsonResponse } from "../runtime/contract/http.js";
import { exchangeDeviceCode, requestDeviceCode } from "./device-flow.js";

// RFC 8628 §3.4 grant_type identifier.
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// Must match the admin router's `/auth/device` page.
const VERIFICATION_PATH = "/_plumix/admin/auth/device";

// Only a fallback: the approval form requires a token name.
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
 * RFC 8628 §3.1. Public and unauthenticated; CLIs pass the CSRF gate by sending
 * `X-Plumix-Request: 1`.
 */
export async function handleDeviceCodeRequest(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const { deviceCode, userCode, expiresIn, interval } = await requestDeviceCode(
    ctx.db,
  );

  const verificationUri = new URL(
    withBasePath(VERIFICATION_PATH, app.config.basePath),
    ctx.origin,
  ).toString();
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
 * RFC 8628 §3.4, errors per §3.5. Never emits `slow_down`: per-client poll
 * cadence isn't tracked.
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
