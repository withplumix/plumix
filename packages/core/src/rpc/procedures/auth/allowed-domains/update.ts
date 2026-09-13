import { eq } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { allowedDomainsUpdateInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const update = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(allowedDomainsUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const patch: {
      defaultRole?: typeof input.defaultRole;
      isEnabled?: boolean;
    } = {};
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
