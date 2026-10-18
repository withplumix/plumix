import type {
  MigrationOwner,
  SyncAfterEvent,
  SyncEnd,
  SyncSettleReport,
} from "../context/runtime-adapter.js";
import type {
  ConnectedObjectStorage,
  SyncDatabase,
} from "../runtime/contract/slots.js";
import { exportScopes, importScopes } from "./sync-replace.js";
import { readSyncHeads } from "./sync.js";

export interface DatabaseSyncEndOptions {
  readonly database: SyncDatabase;
  /** Where `media` reads and writes objects. */
  readonly storage: ConnectedObjectStorage | undefined;
  readonly origin: string;
  /** In application order, as `OpenSyncEndOptions` holds them. */
  readonly owners: readonly MigrationOwner[];
  /** How `sync_migrations_differ` names this end: `local` or `remote`. */
  readonly label: string;
  /** Runs core's `settleSync` inside the site this end is. */
  settle(event: SyncAfterEvent): Promise<SyncSettleReport>;
}

/**
 * An end over a database this process opens itself, such as a SQLite file:
 * its import is one transaction, so a failed one changes nothing.
 */
export function databaseSyncEnd(options: DatabaseSyncEndOptions): SyncEnd {
  const { database, storage } = options;
  const hints = new Map<string, string>();
  const heads = (): Promise<Record<string, string | null>> =>
    readSyncHeads((sql) => database.execute(sql), options.owners);
  return {
    origin: options.origin,
    heads,
    exportData: (scopes, into) => exportScopes(database, storage, scopes, into),
    importData: async (from, scopes, { dryRun }) =>
      importScopes(database, storage, from, scopes, {
        dryRun,
        heads: await heads(),
        label: options.label,
      }),
    async snapshot() {
      const { id, restoreHint } = await database.snapshot();
      hints.set(id, restoreHint);
      return { id };
    },
    restoreHint: (snapshot) =>
      hints.get(snapshot.id) ?? `Restore the snapshot ${snapshot.id}.`,
    settle: (event) => options.settle(event),
    close: () => database.close(),
  };
}
