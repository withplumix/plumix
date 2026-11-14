import type { Credential } from "../../../../context/app-context.js";

/**
 * `undefined` for an API token or an identity provider's assertion, so no
 * session row counts as current.
 */
export function currentSessionId(
  credential: Credential | null,
): string | undefined {
  return credential?.kind === "session" ? credential.sessionId : undefined;
}
