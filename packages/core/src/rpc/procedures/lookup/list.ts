import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { lookupListInputSchema, requireAdapter } from "./schemas.js";

/**
 * The admin only sends kinds from the manifest, so an unknown kind means a
 * stale payload or a malicious caller; it 404s.
 */
export const list = base
  .use(authenticated)
  .input(lookupListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const { adapter } = requireAdapter(context, input.kind, errors);
    const items = await adapter.list(context, {
      query: input.query,
      scope: input.scope,
      limit: input.limit,
      ids: input.ids,
    });
    return { items };
  });
