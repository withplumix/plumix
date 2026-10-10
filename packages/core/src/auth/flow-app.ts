import type { PlumixConfig } from "../config.js";
import type { SessionPolicy } from "./contract/sessions.js";
import type { PasskeyRuntimeConfig } from "./passkey/config.js";

/**
 * Not `PlumixApp`: the composition root can't be imported from this layer, so
 * the app satisfies this structurally.
 */
export interface AuthFlowApp {
  readonly config: PlumixConfig;
  readonly passkey: PasskeyRuntimeConfig;
  readonly sessionPolicy: SessionPolicy;
}
