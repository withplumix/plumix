import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, test } from "vitest";

import { applyCoreTestSchema } from "../test/harness.js";
import { CORE_MIGRATIONS_FOLDER } from "./migrations.js";
import { assertSameHeads, headDifferences, readSyncHeads } from "./sync.js";

describe("headDifferences", () => {
  test("names each owner whose head differs and the end that is behind", () => {
    const differences = headDifferences(
      {
        label: "local",
        heads: { core: "1700000000000", "@acme/plugin": "1800000000000" },
      },
      {
        label: "remote",
        heads: { core: "1750000000000", "@acme/plugin": "1800000000000" },
      },
    );

    expect(differences).toEqual(["core: local is behind remote"]);
  });

  test("an owner one end has never applied is behind on that end", () => {
    const differences = headDifferences(
      { label: "the dump", heads: { core: "1", "@acme/plugin": "5" } },
      { label: "remote", heads: { core: "1" } },
    );

    expect(differences).toEqual(["@acme/plugin: remote is behind the dump"]);
  });
});

describe("assertSameHeads", () => {
  test("throws sync_migrations_differ naming the owner", () => {
    expect(() =>
      assertSameHeads(
        { label: "local", heads: { core: "2" } },
        { label: "remote", heads: { core: "1" } },
      ),
    ).toThrow(
      expect.objectContaining({
        code: "sync_migrations_differ",
        message: expect.stringContaining(
          "core: remote is behind local",
        ) as unknown,
      }),
    );
  });
});

describe("readSyncHeads", () => {
  test("reads an owner's newest applied migration, and null for one never applied", async () => {
    const client = createClient({ url: ":memory:" });
    await applyCoreTestSchema(drizzle(client));
    const newest = await client.execute(
      "SELECT max(created_at) AS created_at FROM __drizzle_migrations_core",
    );

    const heads = await readSyncHeads(
      async (sql) => (await client.execute(sql)).rows,
      [
        {
          name: "core",
          migrationsFolder: CORE_MIGRATIONS_FOLDER,
          migrationsTable: "__drizzle_migrations_core",
        },
        {
          name: "@acme/plugin",
          migrationsFolder: "/nowhere",
          migrationsTable: "__drizzle_migrations_acme_plugin",
        },
      ],
    );

    expect(heads).toEqual({
      core: String(newest.rows[0]?.created_at as number),
      "@acme/plugin": null,
    });
  });
});
