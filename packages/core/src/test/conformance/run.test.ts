import { describe, expect, test } from "vitest";

import type { Db } from "../../context/app-context.js";
import type { RuntimeMigrations } from "../../context/runtime-adapter.js";
import type { RunContractOptions } from "./run.js";
import { createTestDb } from "../harness.js";
import { failingCases } from "./case.js";
import { runContractCases } from "./run.js";

const TARGET = {
  remote: false,
  summary: "local · memory",
  notes: [],
  name: "memory",
};

/**
 * A site over the harness's in-memory database, whose schema is already
 * applied; `openRun` hands back `runDb` for the database binding.
 */
function memorySite(runDb: (site: Db) => Promise<Db>): RunContractOptions {
  return {
    open: async () => {
      const site = await createTestDb();
      const migrations: RuntimeMigrations = {
        legacyTable: "__drizzle_migrations",
        open: () =>
          Promise.resolve({
            drizzle: site,
            migrate: () => Promise.resolve(),
            all: () => Promise.resolve([]),
            batch: () => Promise.resolve(),
            wipe: () => Promise.resolve(),
            close: () => Promise.resolve(),
            target: TARGET,
          }),
        openRun: async () => ({
          env: { DB: await runDb(site) },
          target: TARGET,
          close: () => Promise.resolve(),
        }),
      };
      return {
        migrations,
        cwd: process.cwd(),
        database: {
          kind: "memory",
          connect: (env) => ({ db: (env as { DB: Db }).DB }),
        },
      };
    },
  };
}

describe("run contract cases", () => {
  test("pass a runtime whose run reaches the site's database", async () => {
    const failed = await failingCases(
      runContractCases,
      memorySite((site) => Promise.resolve(site)),
    );

    expect(failed).toEqual([]);
  });

  test("fail a runtime whose run opens another database each time", async () => {
    const failed = await failingCases(
      runContractCases,
      memorySite(() => createTestDb()),
    );

    expect(failed).toEqual(runContractCases.map(({ name }) => name));
  });
});
