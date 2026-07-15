import type { EnvInput } from "plumix";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileConfig {
  /** Public site key rendered in the widget. */
  readonly siteKey: EnvInput<string>;
  /** Secret key used for server-side verification. */
  readonly secretKey: EnvInput<string>;
}

/**
 * Verify a Turnstile token server-side against the siteverify endpoint. Fails
 * closed on an empty token, a non-OK response, or `success !== true`.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const response = await fetchImpl(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) return false;
  const result: unknown = await response.json();
  return (result as { success?: boolean }).success === true;
}

/**
 * Turnstile widget markup + script for the loading page. The success callback
 * starts init; the error/timeout/expired callbacks (and the script's `onerror`,
 * for a blocked `api.js`) fall back to the retry page so a visitor whose
 * challenge fails to load is never left hanging.
 */
export function renderTurnstileWidget(siteKey: string): string {
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer onerror="plumixDemoTurnstileError()"></script>
    <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="plumixDemoTurnstile" data-error-callback="plumixDemoTurnstileError" data-timeout-callback="plumixDemoTurnstileError" data-expired-callback="plumixDemoTurnstileError"></div>`;
}
