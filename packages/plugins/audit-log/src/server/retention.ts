import type { AppContext } from "plumix/plugin";

import type { AuditLogStorage } from "../types.js";
import { AuditLogConfigError } from "./errors.js";

export interface AuditLogRetentionPolicy {
  readonly maxAgeDays: number;
  /**
   * Runs only when a trigger with exactly this schedule fires; on Cloudflare a
   * custom value needs a matching `wrangler.jsonc` `triggers.crons` entry.
   * Defaults to daily at 03:00 UTC.
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
 * Throws on negative `maxAgeDays`, which would delete every row, and on
 * non-finite values, which silently no-op in SQL.
 */
export function assertValidRetention(retention: AuditLogRetentionConfig): void {
  if (retention === false) return;
  if (!Number.isFinite(retention.maxAgeDays) || retention.maxAgeDays < 0) {
    throw AuditLogConfigError.invalidRetentionMaxAge(retention.maxAgeDays);
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
  /**
   * Override the clock; defaults to `new Date()`. Tests pass an explicit value.
   */
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
