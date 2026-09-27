import type { AuthMethodsSummary } from "../../../runtime/app.js";
import { base } from "../../base.js";

// Public — the login screen and the email-change field offer only the flows
// the app enabled. Resolved from config at app build time, so no DB call.
// It rides the RPC rather than the manifest because the manifest is built
// before the runtime env exists (ADR 0014). Passkey is always on, so it
// isn't listed.
export const signInMethods = base.handler(
  ({ context }): Pick<AuthMethodsSummary, "magicLink" | "oauth"> => ({
    magicLink: context.authMethods.magicLink,
    oauth: context.authMethods.oauth,
  }),
);
