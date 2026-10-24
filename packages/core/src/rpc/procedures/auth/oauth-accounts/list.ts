import { asc, eq } from "../../../../db/index.js";
import { oauthAccounts } from "../../../../db/schema/oauth_accounts.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthAccountsListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(oauthAccountsListInputSchema)
  .handler(async ({ context }) => {
    return context.db
      .select({
        id: oauthAccounts.providerAccountId,
        provider: oauthAccounts.provider,
        linkedAt: oauthAccounts.createdAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, context.user.id))
      .orderBy(asc(oauthAccounts.createdAt));
  });
