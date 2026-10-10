import type { AppContext } from "../../../context/app-context.js";
import { and, eq, isNotNull, lte } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  fireEntryPublished,
  fireEntryTransition,
  fireEntryUpdated,
} from "./lifecycle.js";

/**
 * A scheduled entry without a future `publishedAt` would never be picked up by
 * the cron, so the write is rejected.
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
 * Fires the same lifecycle hooks as an editor publish but skips
 * `entry:before_save` and revision capture: a cron run has no actor, and the
 * content was snapshotted when scheduled.
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
