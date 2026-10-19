import type { OpenSyncEndOptions, RuntimeSync, SyncEnd } from "plumix/cli";
import { resolveEnvInput } from "plumix";
import {
  databaseSyncEnd,
  remoteSyncEnd,
  settleSync,
  SyncError,
} from "plumix/cli";
import { buildApp, createRuntimeHandler } from "plumix/runtime";

import { databaseFile, isBunSqlite } from "../bun-sqlite.js";
import { PROJECT_ROOT_ENV } from "../entry-constants.js";
import { MigrationsError } from "../errors.js";
import { openBunSyncDatabase } from "../sync-database.js";

/** The env the site's slots resolve against the project root in, as in dev. */
function projectEnv(cwd: string): NodeJS.ProcessEnv {
  return { ...process.env, [PROJECT_ROOT_ENV]: cwd };
}

/**
 * The local site's own handler, so the work runs with the site's plugins and
 * slots.
 */
async function settleLocally(
  options: OpenSyncEndOptions,
  event: Parameters<SyncEnd["settle"]>[0],
): ReturnType<SyncEnd["settle"]> {
  const app = await buildApp(options.config);
  const handler = createRuntimeHandler(app);
  const { run } = handler;
  if (run === undefined) throw SyncError.settleUnreachable();
  try {
    return await run((ctx) => settleSync(ctx, event), {
      env: projectEnv(options.cwd),
    });
  } finally {
    await handler.dispose?.();
  }
}

function openLocal(options: OpenSyncEndOptions): SyncEnd {
  const database = options.config.database;
  if (!isBunSqlite(database)) {
    throw MigrationsError.databaseNotBunSqlite({ kind: database.kind });
  }
  return databaseSyncEnd({
    database: openBunSyncDatabase(databaseFile(database.config, options.cwd)),
    storage: options.config.storage?.connect(projectEnv(options.cwd)),
    origin: resolveEnvInput(options.config.auth.passkey.origin, process.env),
    owners: options.owners,
    label: "local",
    settle: (event) => settleLocally(options, event),
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
