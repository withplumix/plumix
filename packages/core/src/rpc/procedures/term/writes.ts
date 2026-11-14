import type { AppContext } from "../../../context/app-context.js";
import type { TermWrites } from "./writes-shared.js";
import { actsAsPrincipal } from "../../../context/principal-bound.js";
import { asAuthenticated } from "../entry/writes-shared.js";
import { assignTerm } from "./assign.js";
import { createTerm } from "./create.js";
import { deleteTerm } from "./delete.js";
import { updateTerm } from "./update.js";

/** `ctx.terms` for `ctx`, rebound by `withUser` to the principal it sets. */
export function bindTermWrites(ctx: AppContext): TermWrites {
  return actsAsPrincipal(
    {
      create: async (input) => createTerm(asAuthenticated(ctx), input),
      update: async (input) => updateTerm(asAuthenticated(ctx), input),
      delete: async (id) => deleteTerm(asAuthenticated(ctx), id),
      assign: async (assignment) =>
        assignTerm(asAuthenticated(ctx), assignment),
    },
    bindTermWrites,
  );
}
