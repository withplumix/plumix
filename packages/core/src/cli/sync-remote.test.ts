import { drizzle } from "drizzle-orm/libsql";

import type { RuntimeSync } from "../context/runtime-adapter.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { SyncContractEnds } from "../test/conformance/sync.js";
import { sync } from "../hooks/sync.js";
import { describeSyncContract } from "../test/conformance/sync.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { memorySyncEnds } from "../test/sync/memory-ends.js";
import { libsqlSyncDatabase } from "../test/sync/memory-sync.js";
import { remoteSyncEnd } from "./sync-remote.js";

const REMOTE = "https://remote.example";

/**
 * A local memory end, and a remote end that reaches the other memory site
 * through its own sync routes, dispatched in-process.
 */
async function remoteEnds(hooks: HookRegistry): Promise<SyncContractEnds> {
  const ends = await memorySyncEnds({ hooks });
  const { client } = ends.remote;
  const h = await createDispatcherHarness({
    db: drizzle(client, { casing: "snake_case" }),
    storage: ends.remote.storage,
    config: {
      database: {
        kind: "memory-sync",
        connect: () => ({ db: drizzle(client, { casing: "snake_case" }) }),
        openSync: () => libsqlSyncDatabase(client),
      },
    },
  });
  for (const { handler, plugin } of hooks.getEventHandlers(sync.after)) {
    h.app.hooks.on(sync.after, handler, { plugin });
  }
  const operator = await h.factory.user.create({
    id: 1000,
    email: "operator@remote.example",
    role: "admin",
  });
  const { secret } = await h.factory.apiToken.create({ userId: operator.id });
  const runtimeSync: RuntimeSync = {
    open: (options) =>
      options.target === "local"
        ? ends.sync.open(options)
        : Promise.resolve(
            remoteSyncEnd({
              url: REMOTE,
              apiToken: options.apiToken,
              owners: options.owners,
              fetch: (input, init) => h.dispatch(new Request(input, init)),
            }),
          ),
  };
  return { ...ends, sync: runtimeSync, remoteUrl: REMOTE, apiToken: secret };
}

describeSyncContract({ open: remoteEnds });
