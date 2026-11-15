import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

function verifyAdmin(args: readonly string[]) {
  return execFileAsync("pnpm", ["exec", "tsx", "verify/cli.ts", ...args], {
    cwd: join(import.meta.dirname, ".."),
  });
}

let out = "";

// One worker for the file, since each run wipes and boots a playground
// another run may be using.
test.describe.configure({ mode: "default" });

test.beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), "verify-admin-"));
});

test.afterEach(async () => {
  await rm(out, { recursive: true, force: true });
});

test("verifying a page of core's playground writes its screenshots and a clean report", async () => {
  await verifyAdmin([
    "--site",
    "core",
    "--as",
    "admin",
    "--open",
    "users",
    "--out",
    out,
  ]);

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

test("a page that sends the role elsewhere is reported as a redirect and fails the run", async () => {
  const run = verifyAdmin([
    "--site",
    "core",
    "--as",
    "editor",
    "--open",
    "/users/create",
    "--out",
    out,
  ]);

  await expect(run).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining("redirected /users/create → /users\n"),
  });
  const report: unknown = JSON.parse(
    await readFile(join(out, "report.json"), "utf8"),
  );
  expect(report).toMatchObject({
    redirected: { from: "/users/create", to: "/users" },
  });
});
