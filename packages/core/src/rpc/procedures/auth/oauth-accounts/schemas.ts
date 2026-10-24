import * as v from "valibot";

export const oauthAccountsListInputSchema = v.optional(v.object({}), {});

/** The `auth.oauth.providers` key the account was linked through. */
export const oauthAccountsUnlinkInputSchema = v.object({
  provider: v.pipe(v.string(), v.minLength(1), v.maxLength(32)),
});
