import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { lookupListInputSchema, requireAdapter } from "./schemas.js";

// Generic pickers in the admin (`UserPicker`, `EntryPicker`, etc.)
// dispatch to this procedure with `{ kind, query, scope }`. Server
// looks up the registered `LookupAdapter` for the kind and forwards
// the call. Unknown kinds 404 — the admin should never reach here
// with a kind absent from the manifest, so a missing kind means
// either a stale wire payload or a malicious caller.

export const list = base
  .use(authenticated)
  .input(lookupListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const { adapter } = requireAdapter(context, input.kind, errors);
    const items = await adapter.list(context, {
      query: input.query,
      scope: input.scope,
      limit: input.limit,
    });
    return { items };
  });
