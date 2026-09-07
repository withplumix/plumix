import { describe, expect, test, vi } from "vitest";

import type { CommandContext, PlumixApp } from "@plumix/core";
import { isCliError } from "@plumix/core/cli";
import { createTestDb } from "@plumix/core/test";

import { report } from "../report.js";
import { cronCommand } from "./cron.js";

const TASKS = [
  { id: "session-cleanup", cron: "0 3 * * *", registeredBy: "core" },
  { id: "publish-scheduled", cron: "*/5 * * * *", registeredBy: "core" },
  { id: "retention-purge", cron: "0 4 * * *", registeredBy: "audit-log" },
  { id: "index-drain", registeredBy: "search" },
];

async function context(
  argv: readonly string[],
  scheduled = vi.fn(),
  options: { db?: unknown; tasks?: readonly unknown[] } = {},
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
    cwd: "/site",
    configPath: "/site/plumix.config.ts",
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

describe("plumix cron run", () => {
  test("fires on every invocation, leaving overlap to the caller", async () => {
    // Core's run guard sits on the query layer, which the CLI's cold path is
    // held off. One invocation is one run; the external scheduler owns not
    // overlapping its own, and the docs say so.
    const db = await createTestDb();
    const first = vi.fn();
    const second = vi.fn();

    await cronCommand.run(await context(["run", "*/5 * * * *"], first, { db }));
    await cronCommand.run(
      await context(["run", "*/5 * * * *"], second, { db }),
    );

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
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
