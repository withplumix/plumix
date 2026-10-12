import * as v from "valibot";

import { USER_ROLES } from "../../../../db/schema/users.js";
import { domainPattern } from "../../../contract/validation.js";

const domainSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(domainPattern, "domain must be a valid hostname"),
);

const roleSchema = v.picklist(USER_ROLES);

export const allowedDomainsListInputSchema = v.optional(v.object({}), {});

export const allowedDomainsCreateInputSchema = v.object({
  domain: domainSchema,
  defaultRole: v.optional(roleSchema, "subscriber"),
  isEnabled: v.optional(v.boolean(), true),
});

export const allowedDomainsUpdateInputSchema = v.object({
  domain: domainSchema,
  defaultRole: v.optional(roleSchema),
  isEnabled: v.optional(v.boolean()),
});

export const allowedDomainsDeleteInputSchema = v.object({
  domain: domainSchema,
});
