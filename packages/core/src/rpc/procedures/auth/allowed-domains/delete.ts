import { eq } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { allowedDomainsDeleteInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const del = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(allowedDomainsDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    const [row] = await context.db
      .delete(allowedDomains)
      .where(eq(allowedDomains.domain, input.domain))
      .returning();
    if (!row) {
      throw errors.NOT_FOUND({
        data: { kind: "allowed_domain", id: input.domain },
      });
    }
    return row;
  });
