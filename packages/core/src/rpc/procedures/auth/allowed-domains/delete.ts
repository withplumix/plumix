import { eq } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { allowedDomainsDeleteInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const del = base
  .use(authenticated)
  .input(allowedDomainsDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
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
