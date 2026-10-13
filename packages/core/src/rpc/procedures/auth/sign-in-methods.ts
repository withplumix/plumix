import type { AuthMethodsSummary } from "../../../auth/contract/auth-methods.js";
import { base } from "../../base.js";

/**
 * Rides the RPC rather than the manifest because the manifest is built
 * before the runtime env exists.
 */
export const signInMethods = base.handler(
  ({ context }): AuthMethodsSummary => context.authMethods,
);
