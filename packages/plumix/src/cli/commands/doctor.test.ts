import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommandContext, RuntimeDiagnose } from "@plumix/core";
import { createDispatcherHarness } from "@plumix/core/test";

import { report } from "../report.js";
import { doctorCommand } from "./doctor.js";

async function doctorContext(
  runtimeDiagnose?: RuntimeDiagnose,
): Promise<CommandContext> {
  const harness = await createDispatcherHarness();
  return {
    app: harness.app,
    cwd: "/site",
    configPath: "/site/plumix.config.ts",
    argv: [],
    runtimeDiagnose,
  };
}

function captureReport(): string[] {
  const lines: string[] = [];
  vi.spyOn(report, "info").mockImplementation((line: string) => {
    lines.push(line);
  });
  return lines;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("plumix doctor", () => {
  test("prints each finding the runtime reports for the project, with its fix", async () => {
    const diagnose = vi.fn<RuntimeDiagnose>(() => [
      { level: "ok", message: "Logs go to stdout" },
      { level: "warn", message: "Logs are off", fix: "Turn them on" },
    ]);
    const ctx = await doctorContext(diagnose);
    const lines = captureReport();

    await doctorCommand.run(ctx);

    expect(diagnose).toHaveBeenCalledWith("/site");
    expect(lines.slice(-4)).toEqual([
      "  deploy:",
      "    ok    Logs go to stdout",
      "    warn  Logs are off",
      "          fix: Turn them on",
    ]);
  });
});
