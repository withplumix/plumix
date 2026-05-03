import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { lookupResolveInputSchema, requireAdapter } from "./schemas.js";

// Picker uses this to render the label of an already-selected ID
// (e.g. when an entry's saved meta points at user id "42", the form
// loads showing the user's name + role rather than the bare "42").
// Returns `{ result: null }` when the target is gone or no longer
// matches scope — same orphan semantics as `filterMetaOrphans`
// applies here.

export const resolve = base
  .use(authenticated)
  .input(lookupResolveInputSchema)
  .handler(async ({ input, context, errors }) => {
    const { adapter } = requireAdapter(context, input.kind, errors);
    const result = await adapter.resolve(context, input.id, input.scope);
    return { result };
  });
