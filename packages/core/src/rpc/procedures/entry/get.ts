import { assertCanEditEntry } from "../../../entries/editability.js";
import {
  findReadableEntry,
  resolveEntryRead,
} from "../../../entries/read-service.js";
import { resolveEntryMeta, settleEntryMeta } from "../../../meta/entry.js";
import { getAutosave } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
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
      // Only the editor's read heals the row, since a human is about to see and
      // overwrite it. Public read paths never write.
      const row = await findReadableEntry(context, filtered);
      const { bag } = await settleEntryMeta(context, row, row.meta);
      const live = await resolveEntryRead(context, row, bag);
      if (!filtered.preview) {
        return await context.hooks.applyFilter("rpc:entry.get:output", live);
      }

      // Preview mode: overlay the caller's autosave (if any) onto the live
      // row's read fields. Gated by the editor's own rule because previewing a
      // pending draft is an editor concern.
      assertCanEditEntry(context, live, errors);

      // No live row passed: `live` is already resolved, and a hydrated
      // reference under the edits would be promoted back as the lookup
      // adapter's output.
      const autosave = await getAutosave(context.db, {
        entryId: live.id,
        authorId: context.user.id,
      });
      // `title`, `slug` and `parentId` are live-only, so they stay on `live`,
      // consistent with the `?preview=` render and publish.
      const overlaid = autosave
        ? {
            ...live,
            content: autosave.content,
            excerpt: autosave.excerpt,
            meta: await resolveEntryMeta(context, live, autosave.meta),
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
      throw toRpcEntryReadError(error, errors) ?? error;
    }
  });
