import { listOAuthGrants } from "../../../../auth/oauth-server/grants.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { oauthGrantsAdminListInputSchema } from "./schemas.js";

export const adminList = base
  .use(authenticated)
  .use(requireCapability("user:manage_tokens"))
  .input(oauthGrantsAdminListInputSchema)
  .handler(({ input, context }) => listOAuthGrants(context.db, input.userId));
