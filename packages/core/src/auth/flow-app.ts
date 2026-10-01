import type { PlumixConfig } from "../config.js";
import type { SessionPolicy } from "./contract/sessions.js";
import type { PasskeyRuntimeConfig } from "./passkey/config.js";

/**
 * What the auth-flow route handlers read from the composed app. Named here
 * rather than taken from `PlumixApp`, which sits in the composition root that
 * nothing below it may import; the app satisfies it structurally.
 */
export interface AuthFlowApp {
  readonly config: PlumixConfig;
  readonly passkey: PasskeyRuntimeConfig;
  readonly sessionPolicy: SessionPolicy;
}
