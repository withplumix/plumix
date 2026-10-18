import { resolve } from "node:path";
import type { OpenSyncEndOptions, RuntimeSync, SyncEnd } from "plumix/cli";
import { resolveEnvInput } from "plumix";
import {
  databaseSyncEnd,
  remoteSyncEnd,
  settleSync,
  SyncError,
} from "plumix/cli";
import { buildApp, createRuntimeHandler } from "plumix/runtime";

import { MigrationsError } from "../errors.js";
import { isNodeSqlite, nodeSqlite } from "../node-sqlite.js";
import { openNodeSyncDatabase } from "../sync-database.js";

/**
 * The local site's own handler, with its database at the file `path` names,
 * so the work runs with the site's plugins and slots.
 */
async function settleLocally(
  options: OpenSyncEndOptions,
  path: string,
  event: Parameters<SyncEnd["settle"]>[0],
): ReturnType<SyncEnd["settle"]> {
  const app = await buildApp({
    ...options.config,
    database: nodeSqlite({ path }),
  });
  const handler = createRuntimeHandler(app);
  const { run } = handler;
  if (run === undefined) throw SyncError.settleUnreachable();
  try {
    return await run((ctx) => settleSync(ctx, event), {
      env: process.env,
    });
  } finally {
    await handler.dispose?.();
  }
}

function openLocal(options: OpenSyncEndOptions): SyncEnd {
  const database = options.config.database;
  if (!isNodeSqlite(database)) {
    throw MigrationsError.databaseNotNodeSqlite({ kind: database.kind });
  }
  const path = resolve(options.cwd, database.config.path);
  return databaseSyncEnd({
    database: openNodeSyncDatabase(path),
    storage: options.config.storage?.connect(process.env),
    origin: resolveEnvInput(options.config.auth.passkey.origin, process.env),
    owners: options.owners,
    label: "local",
    settle: (event) => settleLocally(options, path, event),
  });
}

/**
 * `plumix sync` against the SQLite file and storage `plumix dev` uses, and
 * against the deployed site through its sync routes.
 */
export const sync: RuntimeSync = {
  open(options) {
    if (options.target === "local") {
      return new Promise((resolve) => {
        resolve(openLocal(options));
      });
    }
    return Promise.resolve(
      remoteSyncEnd({
        url: options.url,
        apiToken: options.apiToken,
        owners: options.owners,
      }),
    );
  },
};
