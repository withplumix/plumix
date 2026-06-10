import { getEntry } from "../../../entries/read-service.js";
import { getAutosave } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCapability } from "./lifecycle.js";
import { decodeMetaBag } from "./meta.js";
import { toRpcEntryReadError } from "./read-errors.js";
import { entryGetInputSchema } from "./schemas.js";

export const get = base
  .use(authenticated)
  .input(entryGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.get:input",
      input,
    );

    try {
      const live = await getEntry(context, filtered);
      if (!filtered.preview) {
        return await context.hooks.applyFilter("rpc:entry.get:output", live);
      }

      // Preview mode: overlay the caller's autosave (if any) onto the live
      // row's read fields. Gated by edit_own / edit_any because previewing a
      // pending draft is an editor concern.
      const canSeeAny = context.auth.can(
        entryCapability(live.type, "edit_any"),
      );
      const ownsAndCanEdit =
        live.authorId === context.user.id &&
        context.auth.can(entryCapability(live.type, "edit_own"));
      if (!canSeeAny && !ownsAndCanEdit) {
        throw errors.FORBIDDEN({
          data: { capability: entryCapability(live.type, "edit_own") },
        });
      }

      const autosave = await getAutosave(context.db, {
        entryId: live.id,
        authorId: context.user.id,
      });
      const overlaid = autosave
        ? {
            ...live,
            title: autosave.title,
            content: autosave.content,
            excerpt: autosave.excerpt,
            meta: decodeMetaBag(context.plugins, live, autosave.meta),
          }
        : live;
      return await context.hooks.applyFilter("rpc:entry.get:output", {
        ...overlaid,
        _preview: {
          source: autosave ? ("autosave" as const) : ("live" as const),
          autosaveUpdatedAt: autosave?.updatedAt ?? null,
          liveUpdatedAt: live.updatedAt,
        },
      });
    } catch (error) {
      throw toRpcEntryReadError(error, errors);
    }
  });
