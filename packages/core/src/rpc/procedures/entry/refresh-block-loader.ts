import {
  findBlockNode,
  isEntryContent,
  resolveBlockLoaders,
  serializeLoaderData,
} from "@plumix/blocks";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { getAutosave } from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { canReadEntry } from "./lifecycle.js";
import { entryRefreshBlockLoaderInputSchema } from "./schemas.js";

// Re-run a single block's loader(s) on demand — the editor's scoped refresh.
// Loaders are server functions (db / ctx), so a refresh round-trips here rather
// than running client-side. Resolves against the caller's current content (the
// autosave overlay when present, else live), isolated to the target block's
// subtree so siblings' loaders don't re-run. Returns a node-keyed map of the
// re-resolved data, which the editor merges into the canvas's loader data.
export const refreshBlockLoader = base
  .use(authenticated)
  .input(entryRefreshBlockLoaderInputSchema)
  .handler(async ({ input, context, errors }) => {
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.id),
    });
    if (!live || isReservedType(live.type) || !canReadEntry(context, live)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }

    const autosave = await getAutosave(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });
    const content = autosave?.content ?? live.content;
    const node = isEntryContent(content)
      ? findBlockNode(content.blocks, input.blockId)
      : null;
    if (!node) {
      throw errors.NOT_FOUND({ data: { kind: "block", id: input.blockId } });
    }

    const resolved = await resolveBlockLoaders([node], context.blocks, context);
    return {
      data: JSON.parse(serializeLoaderData(resolved)) as Record<
        string,
        Readonly<Record<string, unknown>>
      >,
    };
  });
