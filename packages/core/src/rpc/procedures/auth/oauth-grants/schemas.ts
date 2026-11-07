import * as v from "valibot";

export const oauthGrantsListInputSchema = v.optional(v.object({}), {});

const grantIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const oauthGrantsRevokeInputSchema = v.object({ id: grantIdSchema });

const userIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const oauthGrantsAdminListInputSchema = v.object({
  userId: userIdSchema,
});

export const oauthGrantsAdminRevokeInputSchema = v.object({
  userId: userIdSchema,
  id: grantIdSchema,
});
