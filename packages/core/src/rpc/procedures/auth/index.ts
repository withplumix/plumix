import { allowedDomainsRouter } from "./allowed-domains/index.js";
import { oauthProviders } from "./oauth-providers.js";
import { session } from "./session.js";

export const authRouter = {
  session,
  oauthProviders,
  allowedDomains: allowedDomainsRouter,
} as const;

export type AuthRouter = typeof authRouter;
