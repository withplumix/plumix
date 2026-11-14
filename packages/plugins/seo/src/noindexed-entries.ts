import type { AppContext, PluginSetupContext } from "plumix/plugin";
import { eq } from "plumix/db";
import { entry } from "plumix/plugin";

import { seoNoindexedEntries } from "./db/schema.js";
import { SEO_META_KEYS } from "./meta-keys.js";

async function record(
  ctx: AppContext,
  row: { readonly id: number; readonly type: string },
  noindexed: boolean,
): Promise<void> {
  if (!noindexed) {
    await ctx.db
      .delete(seoNoindexedEntries)
      .where(eq(seoNoindexedEntries.entryId, row.id));
    return;
  }
  await ctx.db
    .insert(seoNoindexedEntries)
    .values({ entryId: row.id, type: row.type })
    .onConflictDoUpdate({
      target: seoNoindexedEntries.entryId,
      set: { type: row.type },
    });
}

/**
 * Only a stored `true` hides an entry. A deleted entry's row goes with it
 * through the foreign key.
 */
export function registerNoindexedEntries(ctx: PluginSetupContext): void {
  ctx.events.on(entry.metaChanged, async ({ entry: row, changes }, appCtx) => {
    if (SEO_META_KEYS.noindex in changes.set) {
      await record(appCtx, row, changes.set[SEO_META_KEYS.noindex] === true);
    } else if (changes.removed.includes(SEO_META_KEYS.noindex)) {
      await record(appCtx, row, false);
    }
  });
  // A row whose meta no `metaChanged` announced: a duplicate's copy, which an
  // update publishes, and a restored revision's. Trash leaves meta alone.
  ctx.events.on(entry.updated, ({ entry: row }, appCtx) =>
    record(appCtx, row, row.meta[SEO_META_KEYS.noindex] === true),
  );
}
