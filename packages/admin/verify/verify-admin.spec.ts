import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("seeding a plugin's playground stores the records its seeder writes and lists them", async () => {
  await verifyAdmin([
    "--site",
    "media",
    "--as",
    "editor",
    "--open",
    "pages-media",
    "--seed",
    "3",
    "--out",
    out,
  ]);

  const report: unknown = JSON.parse(
    await readFile(join(out, "report.json"), "utf8"),
  );
  expect(report).toMatchObject({
    seeded: { media: ["seed-1.png", "seed-2.png", "seed-3.png"] },
    consoleErrors: [],
    failedRequests: [],
  });
});

test("running steps counts each assertion that holds and captures where they ended", async () => {
  await verifyAdmin([
    "--site",
    "media",
    "--as",
    "editor",
    "--open",
    "pages-media",
    "--seed",
    "2",
    "--steps",
    join(
      import.meta.dirname,
      "../../plugins/media/playground/steps/copy-url.ts",
    ),
    "--out",
    out,
  ]);

  expect(await readdir(out)).toContain("steps.png");
  const report: unknown = JSON.parse(
    await readFile(join(out, "report.json"), "utf8"),
  );
  expect(report).toMatchObject({ steps: { passed: 3, failed: [] } });
});

test("a step that fails reports its assertion and fails the run", async () => {
  const steps = join(out, "fails.ts");
  await writeFile(
    steps,
    `export default async ({ page, expect }) => {
      await expect(page.getByTestId("no-such-control")).toBeVisible({ timeout: 1000 });
    };\n`,
  );

  const run = verifyAdmin([
    "--site",
    "core",
    "--as",
    "admin",
    "--open",
    "users",
    "--steps",
    steps,
    "--out",
    out,
  ]);

  await expect(run).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining(
      "steps      0 passed, 1 failed, at steps.png\n  expect(locator).toBeVisible() failed\n",
    ),
  });
  const report: unknown = JSON.parse(
    await readFile(join(out, "report.json"), "utf8"),
  );
  expect(report).toMatchObject({
    steps: {
      passed: 0,
      failed: [
        {
          message: expect.stringContaining(
            "Locator: getByTestId('no-such-control')",
          ),
          screenshot: "steps.png",
        },
      ],
    },
  });
});
