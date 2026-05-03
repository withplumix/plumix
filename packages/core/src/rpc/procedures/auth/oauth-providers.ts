import type { OAuthProviderSummary } from "../../../runtime/app.js";
import { base } from "../../base.js";

// Public — used by the login screen to render provider buttons. Driven
// purely by config (resolved at app build time); no DB call. Returning
// `[]` means "passkey-only", which the admin already knows how to
// render. Each entry carries `key` (URL path segment) and `label`
// (human-readable) so the admin doesn't need a separate lookup table.
export const oauthProviders = base.handler(
  ({ context }): readonly OAuthProviderSummary[] => context.oauthProviders,
);
