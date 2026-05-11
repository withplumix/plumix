import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { CliIO } from "./cli.js";
import { runCli } from "./cli.js";

interface CapturedIO {
  readonly io: CliIO;
  readonly stdout: string[];
  readonly stderr: string[];
}

function captureIO(): CapturedIO {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = {
    stdout: (line: string) => stdout.push(line),
    stderr: (line: string) => stderr.push(line),
  };
  return { io, stdout, stderr };
}

describe("runCli", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "plumix-cli-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("exits 1 with usage on stderr when no target dir is given", async () => {
    const { io, stdout, stderr } = captureIO();

    const code = await runCli([], io);

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toMatch(/usage/i);
  });

  test("--help prints usage to stdout and exits 0", async () => {
    const { io, stdout, stderr } = captureIO();

    const code = await runCli(["--help"], io);

    expect(code).toBe(0);
    expect(stdout.join("\n")).toMatch(/usage/i);
    expect(stderr).toEqual([]);
  });

  test("-h is the short form of --help", async () => {
    const { io, stdout } = captureIO();

    const code = await runCli(["-h"], io);

    expect(code).toBe(0);
    expect(stdout.join("\n")).toMatch(/usage/i);
  });

  test("scaffolds into the given target and prints next-step commands on stdout", async () => {
    const { io, stdout, stderr } = captureIO();
    const target = join(tmp, "my-app");

    const code = await runCli([target], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    const out = stdout.join("\n");
    expect(out).toContain("my-app");
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm dev");
  });

  test("exits 1 and writes the error to stderr when scaffold rejects", async () => {
    const { io, stdout, stderr } = captureIO();
    const target = join(tmp, "missing-parent", "child");

    const code = await runCli([target], io);

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toMatch(/parent.*not exist/i);
  });
});
