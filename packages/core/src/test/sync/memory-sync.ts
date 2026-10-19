import type { Client, InValue, Transaction } from "@libsql/client";

import type { AppContext } from "../../context/app-context.js";
import type {
  OpenSyncEndOptions,
  RuntimeSync,
  SyncEnd,
} from "../../context/runtime-adapter.js";
import type {
  ConnectedObjectStorage,
  SyncDatabase,
  SyncRow,
  SyncSqlExecutor,
  SyncValue,
} from "../../runtime/contract/slots.js";
import { databaseSyncEnd } from "../../cli/sync-end.js";
import { settleSync } from "../../context/settle-sync.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";

/** One end of {@link memorySync}. */
export interface MemorySyncSite {
  /** A migrated database; an in-memory one holds a single connection. */
  readonly client: Client;
  /** Where `media` reads and writes objects. */
  readonly storage?: ConnectedObjectStorage;
  /** What `settle` runs `settleSync` against; without it `settle` throws. */
  readonly ctx?: AppContext;
}

export interface MemorySyncSites {
  readonly local: MemorySyncSite;
  readonly remote: MemorySyncSite;
}

function syncValue(value: unknown): SyncValue {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "bigint") return Number(value);
  return value as SyncValue;
}

function executor(on: Pick<Transaction, "execute">): SyncSqlExecutor {
  return {
    async execute(sql, args = []) {
      const result = await on.execute({ sql, args: [...args] as InValue[] });
      return result.rows.map((row): SyncRow =>
        Object.fromEntries(
          result.columns.map((column) => [column, syncValue(row[column])]),
        ),
      );
    },
  };
}

/**
 * A libsql client as a sync database. It stays open past the end's `close`,
 * since the test that made it reads it back.
 */
export function libsqlSyncDatabase(client: Client): SyncDatabase {
  return {
    ...executor(client),
    async begin() {
      const transaction = await client.transaction("write");
      return {
        ...executor(transaction),
        async commit() {
          await transaction.commit();
          transaction.close();
        },
        rollback() {
          transaction.close();
          return Promise.resolve();
        },
      };
    },
    snapshot: () =>
      Promise.resolve({
        id: "memory",
        restoreHint:
          "This in-memory end takes no snapshot: its import is one transaction, so a failed one changes nothing.",
      }),
    close: () => Promise.resolve(),
  };
}

function originOf(options: OpenSyncEndOptions): string {
  if (options.target === "local") {
    return resolveEnvInput(options.config.auth.passkey.origin, {});
  }
  if (options.url === undefined) {
    throw new Error("memorySync: a remote end needs `url`");
  }
  return options.url;
}

function openEnd(site: MemorySyncSite, options: OpenSyncEndOptions): SyncEnd {
  return databaseSyncEnd({
    database: libsqlSyncDatabase(site.client),
    storage: site.storage,
    origin: originOf(options),
    owners: options.owners,
    label: options.target,
    settle(event) {
      if (site.ctx === undefined) {
        return Promise.reject(
          new Error(`memorySync: the ${options.target} site was given no ctx`),
        );
      }
      return settleSync(site.ctx, event);
    },
  });
}

/**
 * The reference transport: two libsql databases, each with optional object
 * storage and an app context to settle in. Its import is all-or-nothing.
 */
export function memorySync(sites: MemorySyncSites): RuntimeSync {
  return {
    open: (options) =>
      Promise.resolve(
        openEnd(
          options.target === "local" ? sites.local : sites.remote,
          options,
        ),
      ),
  };
}
