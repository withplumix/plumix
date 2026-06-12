import type { AppContext } from "plumix/plugin";
import { and, count, eq, gte } from "drizzle-orm";

import type { RateLimitConfig } from "../types.js";
import { comments } from "../db/schema.js";

/**
 * A hidden form field bots tend to auto-fill. Real users never touch it,
 * so any non-empty value means "drop this submission" — the caller fakes
 * a success rather than revealing the trap.
 */
export function isHoneypotTripped(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Whether this ip hash has hit the submission limit within the window.
 * Counts the plugin's own rows (no separate counter store) so the limiter
 * works on any deployment without a KV binding.
 */
export async function checkRateLimit(
  ctx: AppContext,
  ipHash: string,
  limit: RateLimitConfig,
): Promise<boolean> {
  const since = new Date(Date.now() - limit.windowMin * 60 * 1000);
  const [row] = await ctx.db
    .select({ value: count() })
    .from(comments)
    .where(and(eq(comments.ipHash, ipHash), gte(comments.createdAt, since)));
  return (row?.value ?? 0) >= limit.max;
}
