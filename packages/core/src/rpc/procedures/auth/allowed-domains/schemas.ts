import * as v from "valibot";

import { USER_ROLES } from "../../../../db/schema/users.js";

// RFC 1035-ish domain shape: labels of [a-z0-9] (with internal hyphens),
// 1–63 chars per label, total <= 253. We don't accept punycode-encoded
// names directly — callers should normalise to ASCII before sending.
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const domainSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(DOMAIN_REGEX, "domain must be a valid hostname"),
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
