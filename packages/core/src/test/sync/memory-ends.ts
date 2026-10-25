import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import type { AppContext } from "../../context/app-context.js";
import type { RuntimeSync } from "../../context/runtime-adapter.js";
import type {
  ConnectedCdn,
  SyncRow,
  SyncValue,
} from "../../runtime/contract/slots.js";
import type { SyncContractSite } from "../conformance/sync.js";
import { HookRegistry } from "../../hooks/registry.js";
import { memoryStorage } from "../../runtime/memory-storage.js";
import { createTestContext } from "../context.js";
import { applyCoreTestSchema } from "../harness.js";
import { memorySync } from "./memory-sync.js";

/** One migrated in-memory site, seedable the way the sync contract seeds. */
export interface MemorySyncEnd extends SyncContractSite {
  readonly client: Client;
  readonly ctx: AppContext;
}

export interface MemorySyncEnds {
  readonly sync: RuntimeSync;
  readonly local: MemorySyncEnd;
  readonly remote: MemorySyncEnd;
}

export interface MemorySyncEndsOptions {
  /** Where both sites' `settle` finds its `sync.after` handlers. */
  readonly hooks?: HookRegistry;
  /** The remote site's CDN, which its `settle` purges. */
  readonly remoteCdn?: ConnectedCdn;
}

function syncValue(value: unknown): SyncValue {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : (value as SyncValue);
}

async function memoryEnd(
  hooks: HookRegistry,
  cdn: ConnectedCdn | undefined,
): Promise<MemorySyncEnd> {
  const client = createClient({ url: ":memory:" });
  await applyCoreTestSchema(drizzle(client));
  const ctx = createTestContext({
    db: drizzle(client, { casing: "snake_case" }),
    hooks,
    cdn,
  });
  return {
    client,
    ctx,
    storage: memoryStorage().connect(),
    async execute(sql, args = []) {
      const result = await client.execute({ sql, args: [...args] });
      return result.rows.map((row): SyncRow =>
        Object.fromEntries(
          result.columns.map((column) => [column, syncValue(row[column])]),
        ),
      );
    },
  };
}

/** Two empty, migrated sites and the {@link memorySync} between them. */
export async function memorySyncEnds(
  options: MemorySyncEndsOptions = {},
): Promise<MemorySyncEnds> {
  const hooks = options.hooks ?? new HookRegistry();
  const local = await memoryEnd(hooks, undefined);
  const remote = await memoryEnd(hooks, options.remoteCdn);
  return { sync: memorySync({ local, remote }), local, remote };
}
