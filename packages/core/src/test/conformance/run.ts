import { eq } from "drizzle-orm";
import { expect } from "vitest";

import type { AppContext } from "../../context/app-context.js";
import type { RuntimeMigrations } from "../../context/runtime-adapter.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { DatabaseAdapter } from "../../runtime/contract/slots.js";
import type { ContractCase } from "./case.js";
import { CORE_MIGRATIONS_FOLDER } from "../../cli/migrations.js";
import { entries } from "../../db/schema/entries.js";
import { definePlugin } from "../../plugin/define.js";
import { toggle } from "../../plugin/fields/toggle.js";
import { sweepAllUnsettledMeta } from "../../rpc/procedures/meta/sweep.js";
import { buildApp } from "../../runtime/app.js";
import { createRuntimeHandler } from "../../runtime/handler.js";
import { testConfig } from "../config.js";
import { factoriesFor } from "../factories.js";
import { describeContract } from "./case.js";

/** A site on the runtime under test, its database not yet migrated. */
export interface RunContractSite {
  readonly migrations: RuntimeMigrations;
  /** The project root `migrations.open` and `openRun` resolve against. */
  readonly cwd: string;
  readonly database: DatabaseAdapter;
}

export interface RunContractOptions {
  /** A fresh site for one case. */
  readonly open: () => Promise<RunContractSite>;
}

type Case = ContractCase<RunContractOptions>;

/**
 * A settle writes one query per row, and one call of the admin's Field values
 * page stopped at 25, so this many rows took that page several batches.
 */
const ROWS = 60;

const plugin = definePlugin("run-contract", (ctx) => {
  ctx.registerEntryMetaBox("run-contract-box", {
    label: "Run contract",
    entryTypes: ["post"],
    fields: [toggle("sealed")],
  });
});

interface Site {
  readonly app: PlumixApp;
  /** One `plumix meta` run: `handler.run` in the env `openRun` returns. */
  run<T>(work: (ctx: AppContext) => Promise<T>): Promise<T>;
}

async function migratedSite(options: RunContractOptions): Promise<Site> {
  const site = await options.open();
  const app = await buildApp(
    testConfig({ plugins: [plugin], database: site.database }),
  );
  const target = {
    cwd: site.cwd,
    config: app.config,
    binding: undefined,
    targetValues: {},
  };
  const db = await site.migrations.open({ ...target, location: "site" });
  try {
    await db.migrate({
      migrationsFolder: CORE_MIGRATIONS_FOLDER,
      migrationsTable: "__drizzle_migrations_core",
    });
  } finally {
    await db.close();
  }
  return {
    app,
    async run(work) {
      const opened = await site.migrations.openRun(target);
      const handler = createRuntimeHandler(app);
      try {
        const { run } = handler;
        if (run === undefined) throw new Error("the handler has no run");
        return await run(work, { env: opened.env });
      } finally {
        await handler.dispose?.();
        await opened.close();
      }
    },
  };
}

/** Posts whose `sealed` toggle holds `1`, the form a `json` field stored. */
async function seeded(options: RunContractOptions): Promise<Site> {
  const site = await migratedSite(options);
  await site.run(async (ctx) => {
    const factories = factoriesFor(ctx.db);
    const author = await factories.user.create({});
    for (let row = 0; row < ROWS; row++) {
      await factories.entry.create({
        authorId: author.id,
        type: "post",
        status: "published",
        meta: { sealed: 1 },
      });
    }
  });
  return site;
}

const report = (ctx: AppContext) =>
  sweepAllUnsettledMeta(ctx, { write: false });

const UNSETTLED = {
  store: "entry",
  scope: "post",
  key: "sealed",
  settleable: ROWS,
  unconvertible: 0,
};

export const runContractCases: readonly Case[] = [
  {
    name: "a report counts every seeded unsettled value and writes nothing",
    async run(options) {
      const site = await seeded(options);

      const first = await site.run(report);
      const again = await site.run(report);

      expect(first).toMatchObject({ keys: [UNSETTLED], settled: 0 });
      expect(again).toEqual(first);
    },
  },
  {
    name: "a settle converts more rows than one admin batch reached",
    async run(options) {
      const site = await seeded(options);

      const settle = await site.run((ctx) =>
        sweepAllUnsettledMeta(ctx, { write: true }),
      );
      const left = await site.run(report);
      const stored = await site.run((ctx) =>
        ctx.db
          .select({ meta: entries.meta })
          .from(entries)
          .where(eq(entries.type, "post")),
      );

      expect(settle.settled).toBe(ROWS);
      expect(left.keys).toEqual([]);
      expect(stored).toHaveLength(ROWS);
      expect(new Set(stored.map(({ meta }) => JSON.stringify(meta)))).toEqual(
        new Set([JSON.stringify({ sealed: true })]),
      );
    },
  },
];

/**
 * What `plumix meta report|settle` does on a runtime: core's sweep through
 * `handler.run`, in the env the runtime's `openRun` returns.
 */
export function describeRunContract(options: RunContractOptions): void {
  describeContract("run contract", runContractCases, options);
}
