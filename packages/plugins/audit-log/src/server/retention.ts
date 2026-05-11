import type { AppContext } from "plumix/plugin";

import type { AuditLogStorage } from "../types.js";

export interface AuditLogRetentionPolicy {
  readonly maxAgeDays: number;
}

export type AuditLogRetentionConfig = AuditLogRetentionPolicy | false;

export const DEFAULT_RETENTION: AuditLogRetentionPolicy = { maxAgeDays: 90 };

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
