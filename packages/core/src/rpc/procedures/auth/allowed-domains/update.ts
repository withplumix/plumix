import { eq } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { allowedDomainsUpdateInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const update = base
  .use(authenticated)
  .input(allowedDomainsUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const patch: Partial<{
      defaultRole: typeof input.defaultRole;
      isEnabled: boolean;
    }> = {};
    if (input.defaultRole !== undefined) patch.defaultRole = input.defaultRole;
    if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled;
    if (Object.keys(patch).length === 0) {
      throw errors.CONFLICT({ data: { reason: "empty_patch" } });
    }

    const [row] = await context.db
      .update(allowedDomains)
      .set(patch)
      .where(eq(allowedDomains.domain, input.domain))
      .returning();
    if (!row) {
      throw errors.NOT_FOUND({
        data: { kind: "allowed_domain", id: input.domain },
      });
    }
    return row;
  });
