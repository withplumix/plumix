import { createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { OpenSyncEndOptions } from "../../context/runtime-adapter.js";
import type { ConnectedObjectStorage } from "../../runtime/contract/slots.js";
import { CORE_MIGRATIONS_FOLDER } from "../../cli/migrations.js";
import { testConfig } from "../config.js";
import { describeSyncContract } from "../conformance/sync.js";
import { memoryDump } from "./memory-dump.js";
import { memorySyncEnds } from "./memory-ends.js";
import { memorySync } from "./memory-sync.js";

function openOptions(target: "local" | "remote"): OpenSyncEndOptions {
  return {
    cwd: process.cwd(),
    config: testConfig(),
    target,
    binding: undefined,
    url: "https://remote.example",
    apiToken: () => Promise.resolve("unused"),
    owners: [
      {
        name: "core",
        migrationsFolder: CORE_MIGRATIONS_FOLDER,
        migrationsTable: "__drizzle_migrations_core",
      },
    ],
    targetValues: {},
  };
}

/** Passes every call through, except that the second `put` is refused. */
function refusingSecondPut(
  storage: ConnectedObjectStorage,
): ConnectedObjectStorage {
  let puts = 0;
  return {
    ...storage,
    put: (key, body, opts) => {
      puts += 1;
      if (puts === 2) return Promise.reject(new Error("bucket refused"));
      return storage.put(key, body, opts);
    },
  };
}

describeSyncContract({ open: (hooks) => memorySyncEnds({ hooks }) });

describe("memorySync", () => {
  test("a site given no context refuses to settle", async () => {
    const sync = memorySync({
      local: { client: createClient({ url: ":memory:" }) },
      remote: { client: createClient({ url: ":memory:" }) },
    });
    const end = await sync.open({
      cwd: process.cwd(),
      config: testConfig(),
      target: "remote",
      binding: undefined,
      url: "https://remote.example",
      apiToken: () => Promise.resolve("unused"),
      owners: [
        {
          name: "core",
          migrationsFolder: CORE_MIGRATIONS_FOLDER,
          migrationsTable: "__drizzle_migrations_core",
        },
      ],
      targetValues: {},
    });

    await expect(
      end.settle({ scopes: ["content"], direction: "push" }),
    ).rejects.toThrow(/given no ctx/);
  });

  test("an import whose object writes fail leaves the database and the objects as they were", async () => {
    const ends = await memorySyncEnds();
    await ends.local.execute(
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'a@example.com', 'a', 'admin')",
    );
    await ends.local.execute(
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (1, 'post', 'Local', 'local', 1)",
    );
    await ends.local.storage.put("a.txt", "local a");
    await ends.local.storage.put("b.txt", "local b");
    await ends.remote.execute(
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'a@example.com', 'a', 'admin')",
    );
    await ends.remote.execute(
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (5, 'post', 'Remote', 'remote', 1)",
    );
    await ends.remote.storage.put("a.txt", "remote a");
    await ends.remote.storage.put("c.txt", "remote c");
    const scopes = [
      { name: "content", tables: [{ table: "terms" }, { table: "entries" }] },
      { name: "media", tables: [] },
    ];
    const source = await ends.sync.open(openOptions("local"));
    const dump = memoryDump({
      source: { origin: source.origin, basePath: "" },
      scopes: ["content", "media"],
      heads: await source.heads(),
    });
    await source.exportData(scopes, dump.writer);
    const target = await memorySync({
      local: ends.local,
      remote: {
        ...ends.remote,
        storage: refusingSecondPut(ends.remote.storage),
      },
    }).open(openOptions("remote"));

    await expect(
      target.importData(dump.read(), scopes, { dryRun: false }),
    ).rejects.toThrow("bucket refused");

    expect(await ends.remote.execute("SELECT slug FROM entries")).toEqual([
      { slug: "remote" },
    ]);
    const objects = await ends.remote.storage.list();
    expect(objects.items.map((item) => item.key).sort()).toEqual([
      "a.txt",
      "c.txt",
    ]);
    const a = await ends.remote.storage.get("a.txt");
    expect(await new Response(a?.body).text()).toBe("remote a");
  });
});
