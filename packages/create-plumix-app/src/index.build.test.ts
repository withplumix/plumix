import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const run = promisify(execFile);
const STUBBED = ["npm", "pnpm", "yarn", "bun"] as const;

interface Run {
  readonly stdout: string;
  /** Each stubbed package-manager call, as `<bin> <args…>`. */
  readonly calls: string[];
}

describe("create-plumix-app bin", () => {
  let tmp: string;
  let bin: string;
  let log: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "plumix-bin-test-"));
    bin = join(tmp, "bin");
    log = join(tmp, "calls.log");
    mkdirSync(bin);
    // Stand-in managers that record their argv and succeed, so the real
    // post-scaffold runner spawns them without installing anything.
    for (const name of STUBBED) {
      const stub = join(bin, name);
      writeFileSync(
        stub,
        `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n`,
      );
      chmodSync(stub, 0o755);
    }
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  async function scaffold(
    userAgent: string | undefined,
    extra: readonly string[] = [],
  ): Promise<Run> {
    const env = { ...process.env };
    // Drop the agent the test runner itself was launched with, so the
    // absent case is really absent.
    delete env.npm_config_user_agent;
    if (userAgent !== undefined) env.npm_config_user_agent = userAgent;
    env.PATH = `${bin}${delimiter}${env.PATH ?? ""}`;
    const { stdout } = await run(
      process.execPath,
      [CLI, join(tmp, "site"), "--yes", "--no-git", ...extra],
      { env },
    );
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n")
      : [];
    return { stdout, calls };
  }

  test("installs and runs post-scaffold steps with pnpm when pnpm invoked it", async () => {
    const { stdout, calls } = await scaffold("pnpm/10.0.0 npm/? node/v24");

    expect(calls).toEqual(["pnpm install", "pnpm exec plumix migrate"]);
    expect(stdout).toContain("pnpm dev");
  });

  test("installs and runs post-scaffold steps with bun when bun invoked it", async () => {
    const { stdout, calls } = await scaffold(
      "bun/1.4.2 npm/? node/v24.3.0 linux x64",
    );

    expect(calls).toEqual(["bun install", "bun x plumix migrate"]);
    expect(stdout).toContain("bun dev");
  });

  test("falls back to npm when no user agent is set", async () => {
    const { stdout, calls } = await scaffold(undefined);

    expect(calls).toEqual(["npm install", "npm exec -- plumix migrate"]);
    expect(stdout).toContain("npm run dev");
  });

  test("an explicit --pm wins over the user agent", async () => {
    const { stdout, calls } = await scaffold("pnpm/10.0.0 npm/? node/v24", [
      "--pm",
      "yarn",
    ]);

    expect(calls).toEqual(["yarn install", "yarn exec plumix migrate"]);
    expect(stdout).toContain("yarn dev");
  });
});
