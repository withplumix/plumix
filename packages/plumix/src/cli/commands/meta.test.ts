import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CommandContext,
  ConnectedCdn,
  Db,
  MigrationDatabaseTarget,
  OpenRunOptions,
  PlumixApp,
  PlumixEnv,
  RuntimeMigrations,
  RuntimeTargetOptions,
} from "@plumix/core";
import {
  createRuntimeHandler,
  definePlugin,
  sweepAllUnsettledMeta,
} from "@plumix/core";
import { isCliError } from "@plumix/core/cli";
import { toggle } from "@plumix/core/fields";
import { entries } from "@plumix/core/schema";
import { createDispatcherHarness } from "@plumix/core/test";

import { report } from "../report.js";
import { metaCommand } from "./meta.js";
import { syncDeps } from "./sync.js";

const plugin = definePlugin("test-meta", (ctx) => {
  ctx.registerEntryMetaBox("entry-box", {
    label: "Entry",
    entryTypes: ["post"],
    fields: [toggle("sealed")],
  });
});

/**
 * A real app, database and handler: the command is only as good as the settle
 * it drives, so nothing between the two is stubbed.
 */
async function seeded(
  argv: readonly string[],
  {
    database,
    runtimeMigrations,
    cdn,
    posts = 1,
  }: {
    readonly database?: (db: Db) => PlumixApp["config"]["database"];
    readonly runtimeMigrations?: RuntimeMigrations;
    readonly cdn?: ConnectedCdn;
    readonly posts?: number;
  } = {},
) {
  const harness = await createDispatcherHarness({
    config: { plugins: [plugin] },
    ...(cdn === undefined ? {} : { cdn }),
  });
  const author = await harness.factory.user.create({});
  const [post] = await Promise.all(
    Array.from({ length: posts }, () =>
      harness.factory.entry.create({
        authorId: author.id,
        type: "post",
        status: "published",
        meta: { sealed: 1 },
      }),
    ),
  );
  if (post === undefined) throw new Error("seeded() needs a post");
  const app: PlumixApp = {
    ...harness.app,
    config: {
      ...harness.app.config,
      database: database?.(harness.db) ?? {
        kind: "test",
        connect: () => ({ db: harness.db }),
      },
    },
  };
  const ctx: CommandContext<PlumixApp> = {
    app,
    cwd: process.cwd(),
    configPath: `${process.cwd()}/plumix.config.ts`,
    argv,
    runtimeMigrations: runtimeMigrations ?? runtime(),
  };
  const stored = async (): Promise<unknown> =>
    (
      await harness.db.query.entries.findFirst({
        where: eq(entries.id, post.id),
      })
    )?.meta;
  const unsettled = async (): Promise<number> =>
    (await harness.db.query.entries.findMany()).filter(
      (entry) => (entry.meta as { sealed?: unknown }).sealed === 1,
    ).length;
  return { ctx, stored, unsettled, harness };
}

const LOCAL: MigrationDatabaseTarget = {
  remote: false,
  summary: "local · site.db",
  notes: [],
};

/** A runtime whose run env is `env`, recording how it was opened. */
function runtime(
  env: PlumixEnv = {},
  target: MigrationDatabaseTarget = LOCAL,
  targetOptions?: RuntimeTargetOptions,
): RuntimeMigrations & { readonly opened: OpenRunOptions[] } {
  const opened: OpenRunOptions[] = [];
  return {
    opened,
    ...(targetOptions === undefined ? {} : { targetOptions }),
    legacyTable: "__drizzle_migrations",
    open: () => Promise.reject(new Error("meta never migrates")),
    openRun: (options) => {
      opened.push(options);
      return Promise.resolve({ env, target, close: () => Promise.resolve() });
    },
  };
}

const REMOTE: MigrationDatabaseTarget = {
  remote: true,
  summary: "production (top level) · DB · site",
  notes: [],
};

function captureReport(): string[] {
  const lines: string[] = [];
  for (const level of ["info", "success", "detail"] as const) {
    vi.spyOn(report, level).mockImplementation((line: string) => {
      lines.push(line);
    });
  }
  return lines;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("plumix meta", () => {
  test("reports unsettled values without writing", async () => {
    const lines = captureReport();
    const { ctx, stored } = await seeded([]);

    await metaCommand.run(ctx);

    expect(lines.join("\n")).toContain("sealed");
    expect(await stored()).toEqual({ sealed: 1 });
  });

  test("settle writes what the report found", async () => {
    const lines = captureReport();
    const { ctx, stored } = await seeded(["settle"]);

    await metaCommand.run(ctx);

    expect(await stored()).toEqual({ sealed: true });
    expect(lines.join("\n")).toContain("1");
  });

  // A Cloudflare site's D1 is a binding the runtime opens from here, never in
  // the process env.
  test("runs against the env the runtime opens for the site's database", async () => {
    captureReport();
    const marker = { kind: "proxied-d1" };
    const { ctx, stored } = await seeded(["settle"], {
      database: (db) => ({
        kind: "binding",
        connect: (env) => {
          if ((env as Record<string, unknown>).DB !== marker) {
            throw new Error(
              "the DB binding is only available inside the Worker",
            );
          }
          return { db };
        },
      }),
      runtimeMigrations: runtime({ DB: marker }),
    });

    await metaCommand.run(ctx);

    expect(await stored()).toEqual({ sealed: true });
  });

  test("opens the database the binding and target options name", async () => {
    captureReport();
    const reached = runtime({}, LOCAL, {
      production: { type: "boolean", description: "The deployed one" },
    });
    const { ctx } = await seeded(
      ["report", "--binding", "SECOND", "--production"],
      { runtimeMigrations: reached },
    );

    await metaCommand.run(ctx);

    expect(reached.opened).toMatchObject([
      { binding: "SECOND", targetValues: { production: true } },
    ]);
  });

  test("a target option the runtime doesn't declare is refused, naming the runtime", async () => {
    captureReport();
    const { ctx } = await seeded(["report", "--production"]);

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error) && error.code).toBe("unknown_option");
    expect(isCliError(error) && error.message).toContain(
      ctx.app.config.runtime.name,
    );
  });

  // The rule `plumix migrate` follows for a deployed database.
  describe("a settle of a deployed database", () => {
    test("prints its target and settles once confirmed", async () => {
      const lines = captureReport();
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      const confirm = vi.spyOn(syncDeps, "confirm").mockResolvedValue(true);
      const { ctx, stored } = await seeded(["settle"], {
        runtimeMigrations: runtime({}, REMOTE),
      });

      await metaCommand.run(ctx);

      expect(lines).toContain(`→ ${REMOTE.summary}`);
      expect(confirm).toHaveBeenCalledOnce();
      expect(await stored()).toEqual({ sealed: true });
    });

    test("writes nothing when the prompt is declined", async () => {
      captureReport();
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
      vi.spyOn(syncDeps, "confirm").mockResolvedValue(false);
      const { ctx, stored } = await seeded(["settle"], {
        runtimeMigrations: runtime({}, REMOTE),
      });

      await metaCommand.run(ctx);

      expect(await stored()).toEqual({ sealed: 1 });
    });

    test("--yes skips the prompt", async () => {
      captureReport();
      const confirm = vi.spyOn(syncDeps, "confirm");
      const { ctx, stored } = await seeded(["settle", "--yes"], {
        runtimeMigrations: runtime({}, REMOTE),
      });

      await metaCommand.run(ctx);

      expect(confirm).not.toHaveBeenCalled();
      expect(await stored()).toEqual({ sealed: true });
    });

    test("--dry-run prints what it would settle and stops", async () => {
      const lines = captureReport();
      const { ctx, stored } = await seeded(["settle", "--dry-run"], {
        runtimeMigrations: runtime({}, REMOTE),
      });

      await metaCommand.run(ctx);

      expect(lines.join("\n")).toContain("1 to settle");
      expect(lines).toContain("Dry run: nothing was changed.");
      expect(await stored()).toEqual({ sealed: 1 });
    });

    test("is refused without a terminal or --yes", async () => {
      captureReport();
      vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);
      const { ctx, stored } = await seeded(["settle"], {
        runtimeMigrations: runtime({}, REMOTE),
      });

      const error = await Promise.resolve(metaCommand.run(ctx)).catch(
        (thrown: unknown) => thrown,
      );

      expect(isCliError(error) && error.code).toBe("meta_settle_unconfirmed");
      expect(await stored()).toEqual({ sealed: 1 });
    });
  });

  // One admin call stopped at 25 queries to stay under D1's per-request
  // limit; the command keeps going until every row is walked.
  test("settles more rows than one admin batch reached", async () => {
    const lines = captureReport();
    const { ctx, unsettled } = await seeded(["settle"], { posts: 60 });

    await metaCommand.run(ctx);

    expect(await unsettled()).toBe(0);
    expect(lines).toContain("Settled values in 60 row(s).");
  });

  // The in-site sweep is the reference: the same work through `handler.run`
  // on a site that was never handed to the command.
  test("a settle purges what the in-site sweep purges", async () => {
    captureReport();
    const purged = (): { cdn: ConnectedCdn; tags: string[][] } => {
      const tags: string[][] = [];
      return {
        tags,
        cdn: {
          decorate: (response) => response,
          purgeTags: (batch) => {
            tags.push([...batch].sort());
            return Promise.resolve();
          },
        },
      };
    };
    const viaCli = purged();
    const { ctx } = await seeded(["settle"], { cdn: viaCli.cdn, posts: 2 });
    const inSite = purged();
    const { ctx: reference } = await seeded([], {
      cdn: inSite.cdn,
      posts: 2,
    });

    await metaCommand.run(ctx);
    const handler = createRuntimeHandler(reference.app);
    await handler.run?.(
      (appCtx) => sweepAllUnsettledMeta(appCtx, { write: true }),
      { env: {} },
    );
    await handler.dispose?.();

    expect(inSite.tags.flat()).not.toEqual([]);
    expect(viaCli.tags).toEqual(inSite.tags);
  });

  test("an unknown subcommand names the ones that exist", async () => {
    captureReport();
    const { ctx } = await seeded(["tidy"]);

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error) && error.code).toBe("unknown_subcommand");
  });

  // Calling it an unreachable database would send a Node site to the admin
  // page, where the same query fails the same way.
  test("a query that fails inside the settle surfaces as itself", async () => {
    captureReport();
    const { ctx } = await seeded([], {
      database: () => ({
        kind: "broken-schema",
        connect: () => ({
          db: {
            select: () => {
              throw new Error("no such table: entries");
            },
          },
        }),
      }),
    });

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error)).toBe(false);
    expect(error instanceof Error && error.message).toBe(
      "no such table: entries",
    );
  });

  // A database the runtime opened but the run could not reach, such as a
  // deployed D1 without credentials. The hint names how to pick another.
  test("a database the run can't reach names the options that pick one", async () => {
    captureReport();
    const { ctx } = await seeded([], {
      database: () => ({
        kind: "unreachable",
        connect: () => {
          throw new Error("the DB binding is only available inside the Worker");
        },
      }),
    });

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error) && error.code).toBe("meta_database_unreachable");
    const hint = isCliError(error) ? error.hint : "";
    expect(hint).not.toContain("admin");
    expect(hint).toContain("--binding");
  });
});
