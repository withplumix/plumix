import type { AuthMethodsSummary } from "../../../auth/contract/auth-methods.js";
import { base } from "../../base.js";

/**
 * Rides the RPC rather than the manifest because the manifest is built
 * before the runtime env exists. Passkey is always on, so it isn't listed.
 */
export const signInMethods = base.handler(
  ({ context }): Pick<AuthMethodsSummary, "magicLink" | "oauth"> => ({
    magicLink: context.authMethods.magicLink,
    oauth: context.authMethods.oauth,
  }),
);
