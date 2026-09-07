import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import type { CommandContext, PlumixApp } from "@plumix/core";
import { isCliError } from "@plumix/core/cli";
import { createTestDb } from "@plumix/core/test";

import { report } from "../report.js";
import { cronCommand } from "./cron.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TASKS = [
  { id: "session-cleanup", cron: "0 3 * * *", registeredBy: "core" },
  { id: "publish-scheduled", cron: "*/5 * * * *", registeredBy: "core" },
  { id: "retention-purge", cron: "0 4 * * *", registeredBy: "audit-log" },
  { id: "index-drain", registeredBy: "search" },
];

async function context(
  argv: readonly string[],
  scheduled = vi.fn(),
  options: { db?: TestDb; tasks?: readonly unknown[] } = {},
): Promise<CommandContext> {
  // `cron run` takes the same run guard the in-process scheduler does, so it
  // needs a real database to take it in.
  const db = options.db ?? (await createTestDb());
  const app = {
    scheduledTasks: options.tasks ?? TASKS,
    schema: {},
    config: {
      runtime: { createHandler: () => ({ scheduled }) },
      database: { connect: () => ({ db }) },
    },
  } as unknown as PlumixApp;
  return {
    app,
    // A real directory: `runSchedule` chdirs to it so a database path resolves
    // from where the config was loaded, not from where the shell happened to be.
    cwd: process.cwd(),
    configPath: `${process.cwd()}/plumix.config.ts`,
    argv,
    runtimeMigrate: {},
  };
}

function captureInfo(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(report, "info").mockImplementation((line: string) => {
    lines.push(line);
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("plumix cron list", () => {
  test("prints each distinct schedule with the tasks it fires", async () => {
    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(await context(["list"]));
    } finally {
      restore();
    }
    const output = lines.join("\n");

    expect(output).toContain("*/5 * * * *");
    expect(output).toContain("core:publish-scheduled");
    expect(output).toContain("0 3 * * *");
    expect(output).toContain("audit-log:retention-purge");
  });

  test("shows a task with no cron against every schedule it will run on", async () => {
    // It runs on every firing, so an operator wiring an external scheduler has
    // to see that it is not forgotten.
    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(await context(["list"]));
    } finally {
      restore();
    }
    const output = lines.join("\n");

    expect(output).toContain("search:index-drain");
    expect(output.match(/search:index-drain/g)).toHaveLength(3);
  });

  test("defaults to listing when given no subcommand", async () => {
    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(await context([]));
    } finally {
      restore();
    }
    expect(lines.join("\n")).toContain("*/5 * * * *");
  });
});

describe("plumix cron run", () => {
  test("fires the named schedule through the runtime's handler", async () => {
    const scheduled = vi.fn();
    await cronCommand.run(await context(["run", "*/5 * * * *"], scheduled));

    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(scheduled.mock.calls[0]?.[0]).toMatchObject({ cron: "*/5 * * * *" });
  });

  test("refuses a schedule no task declares, rather than firing nothing", async () => {
    // Silently doing nothing is the failure mode this whole command exists to
    // avoid: the operator would see a green exit and no work done.
    await expect(
      cronCommand.run(await context(["run", "0 9 * * MON"])),
    ).rejects.toThrow(/no scheduled task/i);
  });

  test("refuses a schedule that is not valid cron at all", async () => {
    // A typo is user error, so it has to arrive as a CliError with a hint —
    // anything else the CLI prints as an unexpected internal failure.
    let error: unknown;
    try {
      await cronCommand.run(await context(["run", "every 5m"]));
    } catch (thrown) {
      error = thrown;
    }

    expect(isCliError(error)).toBe(true);
    expect(String(error)).toContain("5 fields");
    expect(isCliError(error) ? error.hint : "").toContain("plumix cron list");
  });

  test("requires an expression to run", async () => {
    await expect(cronCommand.run(await context(["run"]))).rejects.toThrow(
      /expression/i,
    );
  });

  test("rejects an unknown subcommand, naming the ones it has", async () => {
    // The supported list rides on `hint`, which is what the CLI prints under
    // the message.
    let error: unknown;
    try {
      await cronCommand.run(await context(["frobnicate"]));
    } catch (thrown) {
      error = thrown;
    }

    expect(isCliError(error)).toBe(true);
    expect(String(error)).toContain("frobnicate");
    expect(isCliError(error) ? error.hint : "").toContain("plumix cron list");
  });
});

describe("plumix cron run — overlap protection", () => {
  test("takes the same run guard the in-process scheduler does", async () => {
    // This is the `cron: false` path — a system cron or a Kubernetes CronJob —
    // which is exactly where an invocation that overruns its schedule meets the
    // next one starting.
    const db = await createTestDb();
    const first = vi.fn();
    const second = vi.fn();

    await cronCommand.run(await context(["run", "*/5 * * * *"], first, { db }));
    await cronCommand.run(
      await context(["run", "*/5 * * * *"], second, { db }),
    );

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test("says why it did nothing, rather than exiting green in silence", async () => {
    const db = await createTestDb();
    await cronCommand.run(
      await context(["run", "*/5 * * * *"], vi.fn(), { db }),
    );

    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(
        await context(["run", "*/5 * * * *"], vi.fn(), { db }),
      );
    } finally {
      restore();
    }
    expect(lines.join("\n")).toMatch(/already ran this minute/i);
  });

  test("fires the declared spelling when the typed one only differs by spacing", async () => {
    const scheduled = vi.fn();
    await cronCommand.run(await context(["run", "*/5   *  * * *"], scheduled));

    expect(scheduled.mock.calls[0]?.[0]).toMatchObject({
      cron: "*/5 * * * *",
    });
  });
});

describe("plumix cron list — a site whose tasks all run on every firing", () => {
  test("names the tasks instead of reporting none", async () => {
    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(
        await context(["list"], vi.fn(), {
          tasks: [{ id: "index-drain", registeredBy: "search" }],
        }),
      );
    } finally {
      restore();
    }
    const output = lines.join("\n");

    expect(output).not.toContain("no scheduled tasks");
    expect(output).toContain("search:index-drain");
    expect(output).toContain("* * * * *");
  });
});

describe("plumix cron run — parity with the in-process scheduler", () => {
  test("gives each schedule its own lease when no task runs on every firing", async () => {
    // Otherwise two CronJobs firing the same minute contend for one lease and
    // the daily one is skipped until tomorrow — separate pods, so
    // `concurrencyPolicy: Forbid` cannot help.
    const db = await createTestDb();
    const daily = vi.fn();

    await cronCommand.run(
      await context(["run", "*/5 * * * *"], vi.fn(), { db }),
    );
    await cronCommand.run(await context(["run", "0 4 * * *"], daily, { db }));

    expect(daily).toHaveBeenCalledTimes(1);
  });

  test("claims the schedule's own key when no task declares a cron", async () => {
    // The scheduler claims `* * * * *` for an untagged-only site. A CronJob
    // claiming the literal it was invoked with would be a second row for the
    // same work, and both would fire.
    const db = await createTestDb();
    const tasks = [{ id: "index-drain", registeredBy: "search" }];
    const first = vi.fn();
    const second = vi.fn();

    await cronCommand.run(
      await context(["run", "* * * * *"], first, { db, tasks }),
    );
    await cronCommand.run(
      await context(["run", "*/5 * * * *"], second, { db, tasks }),
    );

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test("names the fix when the database has not been migrated", async () => {
    const unmigrated = await createTestDb();
    await unmigrated.run(sql`DROP TABLE scheduled_task_claims`);

    let error: unknown;
    try {
      await cronCommand.run(
        await context(["run", "*/5 * * * *"], vi.fn(), { db: unmigrated }),
      );
    } catch (thrown) {
      error = thrown;
    }

    expect(isCliError(error)).toBe(true);
    expect(isCliError(error) ? error.hint : "").toContain("migrate apply");
  });
});

describe("plumix cron run — reporting task failures", () => {
  test("fails the command when a task threw, naming it", async () => {
    // A CronJob wires alerting to the exit code. Reporting success for a run
    // where every task failed is the failure mode this exists to prevent.
    const scheduled = vi.fn(() =>
      Promise.resolve({ ran: 0, failed: ["reports:purge"] }),
    );

    let error: unknown;
    try {
      await cronCommand.run(await context(["run", "*/5 * * * *"], scheduled));
    } catch (thrown) {
      error = thrown;
    }

    expect(isCliError(error)).toBe(true);
    expect(String(error)).toContain("reports:purge");
  });

  test("succeeds when the tasks did, reporting what ran", async () => {
    const scheduled = vi.fn(() => Promise.resolve({ ran: 2, failed: [] }));
    const { lines, restore } = captureInfo();
    try {
      await cronCommand.run(await context(["run", "*/5 * * * *"], scheduled));
    } finally {
      restore();
    }

    expect(lines.join("\n")).toContain("Fired");
  });

  test("still succeeds against an adapter that reports nothing", async () => {
    // `scheduled` may resolve to nothing; the caller then knows only that the
    // run was attempted, which must not read as a failure.
    const scheduled = vi.fn(() => Promise.resolve(undefined));
    await expect(
      cronCommand.run(await context(["run", "*/5 * * * *"], scheduled)),
    ).resolves.toBeUndefined();
  });
});

describe("plumix cron run — a run that never started", () => {
  test("says nothing ran, rather than naming a task that never did", async () => {
    // A missing binding or an unreachable database aborts before any task. The
    // old shape reported a synthetic `plumix:Error` in `failed`, which sent an
    // operator looking for a task by that name.
    const scheduled = vi.fn(() =>
      Promise.resolve({ ran: 0, failed: [], aborted: "no such binding: DB" }),
    );

    let error: unknown;
    try {
      await cronCommand.run(await context(["run", "*/5 * * * *"], scheduled));
    } catch (thrown) {
      error = thrown;
    }

    expect(isCliError(error)).toBe(true);
    expect(String(error)).toContain("before any task started");
    expect(String(error)).toContain("no such binding: DB");
    expect(isCliError(error) ? error.hint : "").toContain("Nothing ran");
  });
});
