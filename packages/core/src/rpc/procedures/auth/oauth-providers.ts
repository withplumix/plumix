import type { OAuthProviderKey } from "../../../auth/oauth/types.js";
import { base } from "../../base.js";

// Public — used by the login screen to render provider buttons. Driven
// purely by config (resolved at app build time); no DB call. Returning
// `[]` means "passkey-only", which the admin already knows how to render.
export const oauthProviders = base.handler(
  ({ context }): readonly OAuthProviderKey[] => context.oauthProviders,
);
