import { listOAuthGrants } from "../../../../auth/oauth-server/grants.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthGrantsListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(oauthGrantsListInputSchema)
  .handler(({ context }) => listOAuthGrants(context.db, context.user.id));
