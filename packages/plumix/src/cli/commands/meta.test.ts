import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommandContext, PlumixApp } from "@plumix/core";
import { createPlumixHandler, definePlugin } from "@plumix/core";
import { isCliError } from "@plumix/core/cli";
import { entries } from "@plumix/core/db";
import { toggle } from "@plumix/core/fields";
import { createDispatcherHarness } from "@plumix/core/test";

import { report } from "../report.js";
import { metaCommand } from "./meta.js";

const plugin = definePlugin("test-meta", (ctx) => {
  ctx.registerEntryMetaBox("entry-box", {
    label: "Entry",
    entryTypes: ["post"],
    fields: [toggle("sealed")],
  });
});

// A real app, database and handler: the command is only as good as the settle
// it drives, so nothing between the two is stubbed.
async function seeded(
  argv: readonly string[],
  database?: PlumixApp["config"]["database"],
) {
  const harness = await createDispatcherHarness({ plugins: [plugin] });
  const author = await harness.factory.user.create({});
  const post = await harness.factory.entry.create({
    authorId: author.id,
    type: "post",
    status: "published",
    meta: { sealed: 1 },
  });
  const app: PlumixApp = {
    ...harness.app,
    config: {
      ...harness.app.config,
      runtime: {
        ...harness.app.config.runtime,
        createHandler: (built) => createPlumixHandler(built),
      },
      database: database ?? {
        kind: "test",
        connect: () => ({ db: harness.db }),
      },
    },
  };
  const ctx: CommandContext = {
    app,
    cwd: process.cwd(),
    configPath: `${process.cwd()}/plumix.config.ts`,
    argv,
    runtimeMigrate: {},
  };
  const stored = async (): Promise<unknown> =>
    (
      await harness.db.query.entries.findFirst({
        where: eq(entries.id, post.id),
      })
    )?.meta;
  return { ctx, stored };
}

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

  test("an unknown subcommand names the ones that exist", async () => {
    captureReport();
    const { ctx } = await seeded(["tidy"]);

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error) && error.code).toBe("unknown_subcommand");
  });

  // A failure inside the settle is the settle's to report: calling it an
  // unreachable database would send a Node site to the admin page, where the
  // same query fails the same way.
  test("a query that fails inside the settle surfaces as itself", async () => {
    captureReport();
    const { ctx } = await seeded([], {
      kind: "broken-schema",
      connect: () => ({
        db: {
          select: () => {
            throw new Error("no such table: entries");
          },
        },
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

  // What a Cloudflare site hits from a Node process: its D1 binding exists
  // only inside the Worker. The command says where to go instead.
  test("a database this process can't reach points to the admin page", async () => {
    captureReport();
    const { ctx } = await seeded([], {
      kind: "unreachable",
      connect: () => {
        throw new Error("the DB binding is only available inside the Worker");
      },
    });

    const error = await Promise.resolve(metaCommand.run(ctx)).catch(
      (thrown: unknown) => thrown,
    );

    expect(isCliError(error) && error.code).toBe("meta_database_unreachable");
    expect(isCliError(error) && error.hint).toContain("Field values");
  });
});
