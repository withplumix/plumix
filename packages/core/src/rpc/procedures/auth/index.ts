import { allowedDomainsRouter } from "./allowed-domains/index.js";
import { apiTokensRouter } from "./api-tokens/index.js";
import { credentialsRouter } from "./credentials/index.js";
import { deviceFlowRouter } from "./device-flow/index.js";
import { loginLinks } from "./login-links.js";
import { mailerRouter } from "./mailer/index.js";
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
  mailer: mailerRouter,
  apiTokens: apiTokensRouter,
  deviceFlow: deviceFlowRouter,
} as const;

export type AuthRouter = typeof authRouter;
