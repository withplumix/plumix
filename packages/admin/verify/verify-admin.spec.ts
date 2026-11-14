import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);

let out = "";

test.beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), "verify-admin-"));
});

test.afterEach(async () => {
  await rm(out, { recursive: true, force: true });
});

test("verifying a page of core's playground writes its screenshots and a clean report", async () => {
  await run(
    "pnpm",
    [
      "exec",
      "tsx",
      "verify/cli.ts",
      "--site",
      "core",
      "--as",
      "admin",
      "--open",
      "users",
      "--out",
      out,
    ],
    { cwd: join(import.meta.dirname, "..") },
  );

  expect((await readdir(out)).sort()).toEqual([
    "desktop-dark.png",
    "desktop-light.png",
    "phone-light.png",
    "report.json",
  ]);
  const report: unknown = JSON.parse(
    await readFile(join(out, "report.json"), "utf8"),
  );
  expect(report).toMatchObject({
    finalUrl: expect.stringMatching(/\/_plumix\/admin\/users(\?|$)/),
    consoleErrors: [],
    failedRequests: [],
    axeViolations: [],
  });
});
