import type { AppContext } from "../../../context/app-context.js";
import type { EntryWrites } from "./writes-shared.js";
import { actsAsPrincipal } from "../../../context/principal-bound.js";
import { createEntry } from "./create.js";
import { deleteEntry } from "./delete-permanent.js";
import { updateEntry } from "./update.js";
import { asAuthenticated } from "./writes-shared.js";

/** `ctx.entries` for `ctx`, rebound by `withUser` to the principal it sets. */
export function bindEntryWrites(ctx: AppContext): EntryWrites {
  return actsAsPrincipal(
    {
      create: async (input) => createEntry(asAuthenticated(ctx), input),
      update: async (input) => updateEntry(asAuthenticated(ctx), input),
      delete: async (id) => deleteEntry(asAuthenticated(ctx), id),
    },
    bindEntryWrites,
  );
}
