import { basename, dirname, join, resolve } from "node:path";
import type { SyncDatabase, SyncRow, SyncSqlExecutor, SyncValue } from "plumix";

import type { BunSqliteClient } from "./bun-sqlite-client.js";
import { openBunSqlite } from "./bun-sqlite-client.js";

/** The driver is synchronous; a failure still rejects, as on every runtime. */
function settle<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function executor(client: BunSqliteClient): SyncSqlExecutor {
  return {
    execute: (sql, args = []) =>
      settle(
        () =>
          // Safety: `bun:sqlite` hands back each row as a plain object, a BLOB
          // as its bytes.
          client
            .prepare(sql)
            .all(...(args as Exclude<SyncValue, null>[])) as SyncRow[],
      ),
  };
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function quoted(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * The SQLite file at `path` on a connection of its own. A snapshot is a copy
 * beside it, which `VACUUM INTO` writes whole while the site serves requests.
 */
export function openBunSyncDatabase(path: string): SyncDatabase {
  const file = resolve(path);
  const client = openBunSqlite(file);
  return {
    ...executor(client),
    begin: () =>
      settle(() => {
        client.prepare("BEGIN IMMEDIATE").run();
        let open = true;
        return {
          ...executor(client),
          commit: () =>
            settle(() => {
              client.prepare("COMMIT").run();
              open = false;
            }),
          rollback: () =>
            settle(() => {
              if (open) client.prepare("ROLLBACK").run();
              open = false;
            }),
        };
      }),
    snapshot: () =>
      settle(() => {
        const copy = join(
          dirname(file),
          `${basename(file)}.snapshot-${stamp(new Date())}`,
        );
        client.prepare("VACUUM INTO ?").run(copy);
        return {
          id: copy,
          restoreHint: `Saved a snapshot of the database at ${copy}. To restore it, stop the site, then run: cp ${quoted(copy)} ${quoted(file)} && rm -f ${quoted(`${file}-wal`)} ${quoted(`${file}-shm`)}`,
        };
      }),
    close: () =>
      settle(() => {
        client.close();
      }),
  };
}
