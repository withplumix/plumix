import type { AppContext } from "../../../context/app-context.js";
import { now } from "../../../clock.js";
import { and, eq, isNotNull, lte } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryRows } from "./concurrency.js";
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
    (publishedAt === undefined || publishedAt.getTime() <= now().getTime())
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
  const dueBy = now();
  const due = await ctx.db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.status, "scheduled"),
        isNotNull(entries.publishedAt),
        lte(entries.publishedAt, dueBy),
      ),
    );

  let published = 0;
  for (const entry of due) {
    // Decided again from any write that lands first, so a manual publish or
    // reschedule that raced this run is not overwritten.
    const result = await entryRows(ctx.db).writeAsSystem(entry, (row) =>
      row.status === "scheduled" &&
      row.publishedAt !== null &&
      row.publishedAt <= dueBy
        ? { status: "published" }
        : undefined,
    );
    if (!result?.written) continue;

    published += 1;
    const updated = result.row;
    await fireEntryUpdated(ctx, updated, entry);
    await fireEntryTransition(ctx, updated, entry.status);
    await fireEntryPublished(ctx, updated);
  }

  return published;
}
