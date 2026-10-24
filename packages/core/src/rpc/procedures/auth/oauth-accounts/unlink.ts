import type { AuthMethodsSummary } from "../../../../auth/contract/auth-methods.js";
import { and, eq, or, sql } from "../../../../db/index.js";
import { credentials } from "../../../../db/schema/credentials.js";
import { oauthAccounts } from "../../../../db/schema/oauth_accounts.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthAccountsUnlinkInputSchema } from "./schemas.js";

/**
 * The methods whose sign-in needs a row this procedure counts. Any other
 * listed method, such as a magic link, signs the user in by their email.
 */
const COUNTED_METHODS: ReadonlySet<string> = new Set(["passkey", "oauth"]);

function hasEmailSignIn(summary: AuthMethodsSummary): boolean {
  return summary.methods.some((method) => !COUNTED_METHODS.has(method.name));
}

/**
 * Refuses to remove the user's last way to sign in. The check sits in the
 * DELETE's WHERE so concurrent unlinks can't both pass.
 */
export const unlink = base
  .use(authenticated)
  .input(oauthAccountsUnlinkInputSchema)
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id;
    const ownLinks = and(
      eq(oauthAccounts.userId, userId),
      eq(oauthAccounts.provider, input.provider),
    );
    const rows = await context.db
      .delete(oauthAccounts)
      .where(
        hasEmailSignIn(context.authMethods)
          ? ownLinks
          : and(
              ownLinks,
              or(
                sql`EXISTS (SELECT 1 FROM ${credentials} WHERE ${credentials.userId} = ${userId})`,
                sql`EXISTS (SELECT 1 FROM ${oauthAccounts} WHERE ${oauthAccounts.userId} = ${userId} AND ${oauthAccounts.provider} <> ${input.provider})`,
              ),
            ),
      )
      .returning({ id: oauthAccounts.providerAccountId });
    if (rows.length > 0) {
      await context.hooks.doAction(
        "oauth_account:unlinked",
        { provider: input.provider, userId },
        { actor: context.user },
        context,
      );
      return { provider: input.provider };
    }

    // NOT_FOUND when the user has no link to the provider; CONFLICT when the
    // last-sign-in guard refused.
    const [target] = await context.db
      .select({ id: oauthAccounts.providerAccountId })
      .from(oauthAccounts)
      .where(ownLinks);
    if (!target) {
      throw errors.NOT_FOUND({
        data: { kind: "oauth_account", id: input.provider },
      });
    }
    throw errors.CONFLICT({ data: { reason: "last_sign_in_method" } });
  });
