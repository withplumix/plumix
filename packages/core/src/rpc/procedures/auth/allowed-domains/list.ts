import { asc } from "../../../../db/index.js";
import { allowedDomains } from "../../../../db/schema/allowed_domains.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { allowedDomainsListInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

export const list = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(allowedDomainsListInputSchema)
  .handler(async ({ context }) => {
    return context.db
      .select()
      .from(allowedDomains)
      .orderBy(asc(allowedDomains.domain));
  });
