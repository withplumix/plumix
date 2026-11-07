import * as v from "valibot";

export const oauthGrantsListInputSchema = v.optional(v.object({}), {});

const idSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const oauthGrantsRevokeInputSchema = v.object({ id: idSchema });

export const oauthGrantsAdminListInputSchema = v.object({
  userId: idSchema,
});

export const oauthGrantsAdminRevokeInputSchema = v.object({
  userId: idSchema,
  id: idSchema,
});
