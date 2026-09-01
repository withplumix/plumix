import type { AnyPluginDescriptor } from "../config.js";
import {
  ENTRY_CHANGE_FEED_DDL,
  ENTRY_CHANGE_FEED_RESET_DDL,
} from "../entries/change-feed.js";
import { CliError } from "./errors.js";

// A name is spliced into a filename and into the journal tag that
// identifies an already-emitted migration, so it stays as narrow as a
// plugin id.
const MIGRATION_NAME_RE = /^[a-z][a-z0-9_]*$/;

export interface PluginRawSqlMigration {
  readonly pluginId: string;
  readonly name: string;
  readonly statements: readonly string[];
}

/**
 * Core's own non-drizzle DDL, emitted ahead of every plugin's because the
 * objects it creates sit on core's tables. `core` is not a plugin id, and a
 * plugin claiming it collides on identity rather than silently displacing
 * this.
 */
const CORE_SQL_MIGRATIONS: readonly PluginRawSqlMigration[] = [
  {
    pluginId: "core",
    name: "entry_change_feed",
    statements: ENTRY_CHANGE_FEED_DDL,
  },
  {
    pluginId: "core",
    name: "entry_change_feed_guards",
    statements: ENTRY_CHANGE_FEED_RESET_DDL,
  },
  // `meta` joined the watched columns once a field could declare itself
  // searchable. The same reset statements under a new name — an install that
  // already ran the two above needs the update trigger redefined.
  {
    pluginId: "core",
    name: "entry_change_feed_meta",
    statements: ENTRY_CHANGE_FEED_RESET_DDL,
  },
];

function rawSqlMigrationIdentity(migration: PluginRawSqlMigration): string {
  return `${migration.pluginId}_${migration.name}`;
}

export function collectRawSqlMigrations(
  plugins: readonly AnyPluginDescriptor[],
): readonly PluginRawSqlMigration[] {
  const declared: PluginRawSqlMigration[] = [...CORE_SQL_MIGRATIONS];
  const identities = new Set(declared.map(rawSqlMigrationIdentity));
  for (const plugin of plugins) {
    for (const migration of plugin.sqlMigrations ?? []) {
      if (!MIGRATION_NAME_RE.test(migration.name)) {
        throw CliError.rawSqlMigrationInvalidName({
          pluginId: plugin.id,
          name: migration.name,
          pattern: MIGRATION_NAME_RE.source,
        });
      }
      const entry: PluginRawSqlMigration = {
        pluginId: plugin.id,
        ...migration,
      };
      const identity = rawSqlMigrationIdentity(entry);
      if (identities.has(identity)) {
        throw CliError.rawSqlMigrationDuplicate({ identity });
      }
      identities.add(identity);
      declared.push(entry);
    }
  }
  return declared;
}

/** drizzle's own journal shape, read from `<out>/meta/_journal.json`.
 *  drizzle-kit numbers its next migration from the last entry, so a raw
 *  file that is not registered here gets a duplicate index on the next
 *  generate — and `wrangler d1 migrations apply` orders by that index. */
interface MigrationJournalEntry {
  readonly idx: number;
  readonly version: string;
  readonly when: number;
  readonly tag: string;
  readonly breakpoints: boolean;
}

export interface MigrationJournal {
  readonly version: string;
  readonly dialect: string;
  readonly entries: readonly MigrationJournalEntry[];
}

interface EmittedRawSqlMigration {
  readonly tag: string;
  readonly sql: string;
}

export interface RawSqlMigrationPlan {
  readonly emit: readonly EmittedRawSqlMigration[];
  readonly journal: MigrationJournal;
}

// The snapshot version drizzle-kit stamps on a sqlite journal entry. Only
// reached when the journal has no entries to copy it from.
const SQLITE_SNAPSHOT_VERSION = "6";

// `plumix` marks the tag as raw SQL we emitted rather than a drizzle diff,
// which is what keeps identity matching off drizzle's random tag names.
const RAW_TAG_PREFIX = "plumix";
const RAW_TAG_RE = new RegExp(`^\\d+_${RAW_TAG_PREFIX}_(.+)$`);

/**
 * Append every declared migration the journal does not already carry,
 * numbering from its last index. Pure — the caller writes the files.
 */
export function planRawSqlMigrations(
  declared: readonly PluginRawSqlMigration[],
  journal: MigrationJournal,
  now: number,
): RawSqlMigrationPlan {
  const emitted = new Set(
    journal.entries.map((entry) => RAW_TAG_RE.exec(entry.tag)?.[1]),
  );
  const last = journal.entries.at(-1);
  const emit: EmittedRawSqlMigration[] = [];
  const entries = [...journal.entries];
  let idx = last === undefined ? 0 : last.idx + 1;
  // Drizzle's migrator marks a migration applied by its `when`, and skips
  // any later one that is not strictly newer — so a run that emits several
  // cannot stamp them all with the same millisecond.
  let when = Math.max(now, (last?.when ?? 0) + 1);

  for (const migration of declared) {
    const identity = rawSqlMigrationIdentity(migration);
    if (emitted.has(identity)) continue;
    const tag = `${String(idx).padStart(4, "0")}_${RAW_TAG_PREFIX}_${identity}`;
    emit.push({ tag, sql: renderSql(migration.statements) });
    entries.push({
      idx,
      version: last?.version ?? SQLITE_SNAPSHOT_VERSION,
      when,
      tag,
      breakpoints: true,
    });
    idx += 1;
    when += 1;
  }

  return { emit, journal: { ...journal, entries } };
}

function renderSql(statements: readonly string[]): string {
  return `${statements
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "")
    .map(terminate)
    .join("\n--> statement-breakpoint\n")}\n`;
}

function terminate(statement: string): string {
  const body = statement.replace(/;$/, "").trimEnd();
  // `wrangler d1 migrations apply` closes a BEGIN…END block only when the
  // END is whitespace-preceded, and it appends its own bookkeeping INSERT to
  // the file it runs. A trigger ending `…;END` would leave the block open and
  // swallow that INSERT, so the migration applies but is never recorded.
  return `${body.replace(/([^\w\s])(END)$/i, "$1\n$2")};`;
}
