import { asc } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { allowedDomainsListInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const list = base
  .use(authenticated)
  .input(allowedDomainsListInputSchema)
  .handler(async ({ context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    return context.db
      .select()
      .from(allowedDomains)
      .orderBy(asc(allowedDomains.domain));
  });
