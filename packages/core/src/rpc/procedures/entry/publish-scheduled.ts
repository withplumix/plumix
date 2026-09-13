import type { AppContext } from "../../../context/app.js";
import { and, eq, isNotNull, lte } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  fireEntryPublished,
  fireEntryTransition,
  fireEntryUpdated,
} from "./lifecycle.js";

/**
 * True when a `scheduled` write lacks a valid target time. A scheduled entry
 * must carry a future `publishedAt` — without one the cron can never pick it
 * up, so the write is rejected rather than silently stranded.
 */
export function scheduledDateInvalid(
  status: string | undefined,
  publishedAt: Date | undefined,
): boolean {
  return (
    status === "scheduled" &&
    (publishedAt === undefined || publishedAt.getTime() <= Date.now())
  );
}

/**
 * Publish every scheduled entry whose target `publishedAt` has arrived,
 * returning how many were published. Driven by the core `publish-scheduled`
 * cron task. Each transition flips `status` to `published` (keeping the
 * scheduled `publishedAt` as the publish time, WordPress-style) and fires the
 * same lifecycle hooks the editor's publish path does — so cache-purge,
 * sitemap invalidation, and audit all run.
 *
 * Unlike the editor path this skips `entry:before_save` and revision capture:
 * a cron run has no `ctx.user`, so there's no actor to attribute a revision to
 * and the content was already snapshotted when it was scheduled.
 */
export async function publishDueScheduledEntries(
  ctx: AppContext,
): Promise<number> {
  const now = new Date();
  const due = await ctx.db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.status, "scheduled"),
        isNotNull(entries.publishedAt),
        lte(entries.publishedAt, now),
      ),
    );

  let published = 0;
  for (const entry of due) {
    // Re-assert `status='scheduled'` in the write so a manual publish that
    // raced this run flips the row once and fires hooks once.
    const flipped = await ctx.db
      .update(entries)
      .set({ status: "published" })
      .where(and(eq(entries.id, entry.id), eq(entries.status, "scheduled")))
      .returning({ id: entries.id });
    if (flipped.length === 0) continue;

    published += 1;
    const updated = { ...entry, status: "published" as const };
    await fireEntryUpdated(ctx, updated, entry);
    await fireEntryTransition(ctx, updated, entry.status);
    await fireEntryPublished(ctx, updated);
  }

  return published;
}
