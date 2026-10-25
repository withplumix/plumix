import type {
  MigrationOwner,
  MigrationRow,
  SyncScopeTable,
} from "../context/runtime-adapter.js";
import { CliError } from "./errors.js";

type SyncErrorCode =
  | "sync_migrations_differ"
  | "sync_author_missing"
  | "sync_storage_missing"
  | "sync_unknown_scope"
  | "sync_scope_requires"
  | "sync_dump_incomplete"
  | "sync_dump_malformed"
  | "sync_remote_refused"
  | "sync_table_outside_scope"
  | "sync_remote_url_missing"
  | "sync_settle_unreachable";

/** What a sync transport throws, so every runtime fails in the same words. */
export class SyncError extends CliError<SyncErrorCode> {
  static {
    SyncError.prototype.name = "SyncError";
  }

  static migrationsDiffer(ctx: { differences: readonly string[] }): SyncError {
    return new SyncError(
      "sync_migrations_differ",
      `The two ends have not applied the same migrations:\n${ctx.differences.map((d) => `  - ${d}`).join("\n")}`,
      "Nothing was changed. Run `plumix migrate` on the end that is behind (with the target option that names the deployed database, such as `--production` on Cloudflare), then sync again.",
      undefined,
    );
  }

  static authorMissing(ctx: {
    table: string;
    column: string;
    userId: string;
  }): SyncError {
    return new SyncError(
      "sync_author_missing",
      `${ctx.table}.${ctx.column} references user ${ctx.userId}, who is not among the dump's authors`,
      "Nothing was changed. Export the dump again: an export writes every user its rows reference.",
      undefined,
    );
  }

  static unknownScope(ctx: {
    scope: string;
    available: readonly string[];
  }): SyncError {
    return new SyncError(
      "sync_unknown_scope",
      `There is no sync scope "${ctx.scope}"`,
      `This site's scopes: ${ctx.available.join(", ")}. A plugin is a scope only when it owns tables.`,
      undefined,
    );
  }

  static scopeRequires(ctx: {
    scope: string;
    requires: string;
    reason: string;
  }): SyncError {
    return new SyncError(
      "sync_scope_requires",
      `The ${ctx.scope} scope travels only with ${ctx.requires}: ${ctx.reason}`,
      `Nothing was opened. Add \`--scope ${ctx.requires}\`.`,
      undefined,
    );
  }

  static dumpIncomplete(): SyncError {
    return new SyncError(
      "sync_dump_incomplete",
      "The dump stream ended before its last line",
      "Nothing was changed. Sync again.",
      undefined,
    );
  }

  static dumpMalformed(): SyncError {
    return new SyncError(
      "sync_dump_malformed",
      "A line of the dump stream is not one a sync writes",
      "Nothing was changed. Check that both ends run the same Plumix version, then sync again.",
      undefined,
    );
  }

  static remoteRefused(ctx: {
    url: string;
    status: number;
    body: string;
  }): SyncError {
    return new SyncError(
      "sync_remote_refused",
      `${ctx.url} answered ${String(ctx.status)}: ${ctx.body}`,
      ctx.status === 401 || ctx.status === 403
        ? "Use an API token whose user holds settings:manage, through `--token` or PLUMIX_API_TOKEN."
        : undefined,
      undefined,
    );
  }

  static tableOutsideScope(ctx: { scope: string; table: string }): SyncError {
    return new SyncError(
      "sync_table_outside_scope",
      `The table ${ctx.table} is not one the ${ctx.scope} scope holds on this site`,
      "Nothing was changed.",
      undefined,
    );
  }

  static remoteUrlMissing(): SyncError {
    return new SyncError(
      "sync_remote_url_missing",
      "A remote sync end needs the deployed site's origin",
      "Pass `--url <origin>`.",
      undefined,
    );
  }

  static settleUnreachable(): SyncError {
    return new SyncError(
      "sync_settle_unreachable",
      "The local site's handler can't run work outside a request, so it can't settle",
      "The data was replaced. Run the `sync.after` work yourself, or restart `plumix dev`.",
      undefined,
    );
  }

  static storageMissing(): SyncError {
    return new SyncError(
      "sync_storage_missing",
      "The media scope needs the site's storage, and this end has none",
      "Configure the `storage` slot in plumix.config.ts, or sync without `--scope media`.",
      undefined,
    );
  }
}

export function isSyncError(error: unknown): error is SyncError {
  return error instanceof SyncError;
}

/** Each owner's head, as {@link readSyncHeads} reads it, on one named end. */
export interface SyncHeadsAt {
  readonly label: string;
  readonly heads: Readonly<Record<string, string | null>>;
}

function headOrder(head: string | null): number {
  return head === null ? -Infinity : Number(head);
}

/** One line per owner whose head differs, naming the end that is behind. */
export function headDifferences(a: SyncHeadsAt, b: SyncHeadsAt): string[] {
  const owners = [
    ...new Set([...Object.keys(a.heads), ...Object.keys(b.heads)]),
  ];
  const differences: string[] = [];
  for (const owner of owners) {
    const headA = a.heads[owner] ?? null;
    const headB = b.heads[owner] ?? null;
    if (headA === headB) continue;
    const [behind, ahead] =
      headOrder(headA) < headOrder(headB) ? [a, b] : [b, a];
    differences.push(`${owner}: ${behind.label} is behind ${ahead.label}`);
  }
  return differences;
}

/** Throws `sync_migrations_differ` unless both ends are at the same heads. */
export function assertSameHeads(a: SyncHeadsAt, b: SyncHeadsAt): void {
  const differences = headDifferences(a, b);
  if (differences.length > 0) throw SyncError.migrationsDiffer({ differences });
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Each owner's newest applied migration as its `created_at`, drizzle's own
 * high-water mark, or `null` when it has applied none.
 */
export async function readSyncHeads(
  all: (sql: string) => Promise<readonly MigrationRow[]>,
  owners: readonly MigrationOwner[],
): Promise<Record<string, string | null>> {
  const heads: Record<string, string | null> = {};
  for (const owner of owners) {
    const tracked = await all(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${quote(owner.migrationsTable)}`,
    );
    if (tracked.length === 0) {
      heads[owner.name] = null;
      continue;
    }
    const [newest] = await all(
      `SELECT created_at FROM "${owner.migrationsTable}" ORDER BY created_at DESC LIMIT 1`,
    );
    heads[owner.name] = newest === undefined ? null : String(newest.created_at);
  }
  return heads;
}

/** The core scopes' tables, each list in load order. */
export const CORE_SYNC_SCOPE_TABLES: Readonly<
  Record<"users" | "content" | "media", readonly SyncScopeTable[]>
> = {
  users: [{ table: "users" }, { table: "credentials" }],
  content: [
    { table: "terms" },
    { table: "entries" },
    { table: "entry_term" },
    { table: "settings" },
  ],
  media: [],
};

/** Auth state: in no scope, never in a dump. */
export const SYNC_AUTH_TABLES: readonly string[] = [
  "sessions",
  "api_tokens",
  "auth_tokens",
  "device_codes",
  "oauth_accounts",
];
