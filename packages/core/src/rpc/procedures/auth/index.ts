import { allowedDomainsRouter } from "./allowed-domains/index.js";
import { credentialsRouter } from "./credentials/index.js";
import { loginLinks } from "./login-links.js";
import { oauthProviders } from "./oauth-providers.js";
import { session } from "./session.js";
import { sessionsRouter } from "./sessions/index.js";

export const authRouter = {
  session,
  oauthProviders,
  loginLinks,
  allowedDomains: allowedDomainsRouter,
  credentials: credentialsRouter,
  sessions: sessionsRouter,
} as const;

export type AuthRouter = typeof authRouter;
