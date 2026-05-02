import { isUniqueConstraintError } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { allowedDomainsCreateInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const create = base
  .use(authenticated)
  .input(allowedDomainsCreateInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    try {
      const [row] = await context.db
        .insert(allowedDomains)
        .values({
          domain: input.domain,
          defaultRole: input.defaultRole,
          isEnabled: input.isEnabled,
        })
        .returning();
      if (!row)
        throw new Error("allowedDomains.create: insert returned no row");
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "domain_exists" } });
      }
      throw error;
    }
  });
