import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { CommandRunner } from "./post-scaffold.js";
import type { CliIO } from "./reporter.js";
import { runCli } from "./cli.js";
import { BANNER } from "./reporter.js";

interface CapturedIO {
  readonly io: CliIO;
  readonly stdout: string[];
  readonly stderr: string[];
}

function dependenciesOf(dir: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return pkg.dependencies ?? {};
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

// A runner that spawns nothing, so tests never actually install or init git,
// plus a fixed user agent so package-manager detection is deterministic.
const noopRunner: CommandRunner = { run: () => Promise.resolve({ ok: true }) };
const run = (argv: readonly string[], io: CliIO): Promise<number> =>
  runCli(argv, io, { runner: noopRunner, userAgent: "pnpm/8.0.0 npm/? node" });

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

    const code = await run([], io);

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toMatch(/usage/i);
  });

  test("--help prints usage to stdout and exits 0", async () => {
    const { io, stdout, stderr } = captureIO();

    const code = await run(["--help"], io);

    expect(code).toBe(0);
    expect(stdout.join("\n")).toMatch(/usage/i);
    expect(stderr).toEqual([]);
  });

  test("-h is the short form of --help", async () => {
    const { io, stdout } = captureIO();

    const code = await run(["-h"], io);

    expect(code).toBe(0);
    expect(stdout.join("\n")).toMatch(/usage/i);
  });

  test("scaffolds into the given target and prints next-step commands on stdout", async () => {
    const { io, stdout, stderr } = captureIO();
    const target = join(tmp, "my-app");

    // --no-install so the install step appears in next-steps (otherwise it
    // is auto-run and omitted).
    const code = await run([target, "--no-install", "--no-git"], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    const out = stdout.join("\n");
    expect(out).toContain(BANNER);
    expect(out).toContain("my-app");
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm dev");
  });

  test("auto-install omits the install step from next-steps", async () => {
    const { io, stdout } = captureIO();
    const target = join(tmp, "installed-app");

    await run([target, "--no-git"], io);

    const out = stdout.join("\n");
    expect(out).toContain("pnpm dev");
    expect(out).not.toContain("pnpm install");
  });

  test("--runtime selects the runtime and scaffolds it", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "cf-app");

    const code = await run([target, "--runtime", "cloudflare"], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(existsSync(join(target, "wrangler.jsonc"))).toBe(true);
  });

  test("--yes with no --plugins scaffolds the recommended plugins", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "yes-recommended");

    const code = await run([target, "--yes"], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const config = readFileSync(join(target, "plumix.config.ts"), "utf8");
    expect(config).toContain("seo(),");
    expect(config).toContain("feeds(),");
    expect(dependenciesOf(target)).toHaveProperty("@plumix/plugin-seo");
    expect(dependenciesOf(target)).toHaveProperty("@plumix/plugin-feeds");
  });

  test("-p includes comma-separated plugins in the scaffold", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "flagged-plugins");

    const code = await run([target, "-p", "blog,media"], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const config = readFileSync(join(target, "plumix.config.ts"), "utf8");
    expect(config).toContain("blog(),");
    expect(config).toContain("media(),");
  });

  test("-p replaces the recommended set rather than adding to it", async () => {
    const { io } = captureIO();
    const target = join(tmp, "deselected");

    await run([target, "-p", "blog"], io);

    const config = readFileSync(join(target, "plumix.config.ts"), "utf8");
    expect(config).toContain("blog(),");
    expect(config).not.toContain("seo(");
    expect(config).not.toContain("feeds(");
    expect(dependenciesOf(target)).not.toHaveProperty("@plumix/plugin-seo");
    expect(dependenciesOf(target)).not.toHaveProperty("@plumix/plugin-feeds");
  });

  test("an empty --plugins list scaffolds a blank app", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "empty-plugins");

    const code = await run([target, "--plugins="], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const config = readFileSync(join(target, "plumix.config.ts"), "utf8");
    expect(config).toContain("plugins: []");
  });

  test("exits 1 pointing at --plugins when the removed --template flag is used", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "tpl");

    const code = await run([target, "--template", "blog"], io);

    expect(code).toBe(1);
    expect(stderr.join("\n")).toMatch(/--template.*removed.*--plugins/is);
    expect(existsSync(target)).toBe(false);
  });

  test("exits 1 for an unknown --pm", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "bad-pm");

    const code = await run([target, "--pm", "foo"], io);

    expect(code).toBe(1);
    expect(stderr.join("\n")).toMatch(/unknown package manager "foo"/i);
  });

  test("exits 1 with a listing error for an unknown --runtime", async () => {
    const { io, stderr } = captureIO();
    const target = join(tmp, "bad-runtime");

    const code = await run([target, "--runtime", "nope"], io);

    expect(code).toBe(1);
    expect(stderr.join("\n")).toMatch(/unknown runtime "nope".*cloudflare/is);
  });

  test("exits 1 and writes the error to stderr when scaffold rejects", async () => {
    const { io, stdout, stderr } = captureIO();
    const target = join(tmp, "missing-parent", "child");

    const code = await run([target], io);

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toMatch(/parent.*not exist/i);
  });
});
