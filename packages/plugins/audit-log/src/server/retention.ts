import type { AppContext } from "plumix/plugin";

import type { AuditLogStorage } from "../types.js";

export interface AuditLogRetentionPolicy {
  readonly maxAgeDays: number;
  /**
   * Cron expression metadata for the registered scheduled task.
   * Informational in v1 — runtime dispatch fires every registered
   * task on each scheduled invocation regardless of this value (see
   * `registerScheduledTask` docs). Operators set the actual cadence
   * via `wrangler.toml [triggers] crons`. Defaults to `"0 3 * * *"`
   * (daily at 03:00 UTC).
   */
  readonly purgeAt?: string;
}

export type AuditLogRetentionConfig = AuditLogRetentionPolicy | false;

export const DEFAULT_PURGE_CRON = "0 3 * * *";

export const DEFAULT_RETENTION: AuditLogRetentionPolicy = {
  maxAgeDays: 90,
  purgeAt: DEFAULT_PURGE_CRON,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Throws on configs that would corrupt the audit log. Negative
 * `maxAgeDays` puts the cutoff in the future and deletes every row;
 * `NaN` / `Infinity` produce an Invalid Date that silently no-ops in
 * SQL. Either way, fail loud at the config site.
 */
export function assertValidRetention(retention: AuditLogRetentionConfig): void {
  if (retention === false) return;
  if (!Number.isFinite(retention.maxAgeDays) || retention.maxAgeDays < 0) {
    // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
    throw new Error(
      `[plumix/plugin-audit-log] retention.maxAgeDays must be a non-negative finite number (got ${retention.maxAgeDays})`,
    );
  }
}

export function computeRetentionCutoff(
  now: Date,
  policy: AuditLogRetentionPolicy,
): Date {
  assertValidRetention(policy);
  return new Date(now.getTime() - policy.maxAgeDays * MS_PER_DAY);
}

export interface RunRetentionPurgeArgs {
  readonly storage: AuditLogStorage;
  readonly retention: AuditLogRetentionConfig;
  /** Override the clock; defaults to `new Date()`. Tests pass an explicit value. */
  readonly now?: Date;
}

export interface RunRetentionPurgeResult {
  readonly deleted: number;
}

export async function runRetentionPurge(
  ctx: AppContext,
  args: RunRetentionPurgeArgs,
): Promise<RunRetentionPurgeResult> {
  if (args.retention === false) return { deleted: 0 };
  if (!args.storage.purge) {
    ctx.logger.warn(
      `[plumix/plugin-audit-log] storage "${args.storage.kind}" does not implement purge() — retention skipped`,
    );
    return { deleted: 0 };
  }
  const cutoff = computeRetentionCutoff(args.now ?? new Date(), args.retention);
  return args.storage.purge(ctx, { cutoff });
}
