import { createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

import { CORE_MIGRATIONS_FOLDER } from "../../cli/migrations.js";
import { testConfig } from "../config.js";
import { describeSyncContract } from "../conformance/sync.js";
import { memorySyncEnds } from "./memory-ends.js";
import { memorySync } from "./memory-sync.js";

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
      owners: [
        {
          name: "core",
          migrationsFolder: CORE_MIGRATIONS_FOLDER,
          migrationsTable: "__drizzle_migrations_core",
        },
      ],
    });

    await expect(
      end.settle({ scopes: ["content"], direction: "push" }),
    ).rejects.toThrow(/given no ctx/);
  });
});
