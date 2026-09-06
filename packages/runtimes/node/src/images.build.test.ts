import { execFile } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";

import { CLI_ENV, PACKAGE_ROOT } from "./test/consumer-project.js";

const run = promisify(execFile);

let dir: string;

// A real copy of the built package, not a link: `sharp` is required relative
// to the package's own location, and a link back into this workspace would
// find the development install. From the copy, nothing resolves it.
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-images-"));
  const modules = join(dir, "node_modules");
  const copy = join(modules, "@plumix/runtime-node");
  mkdirSync(copy, { recursive: true });
  cpSync(join(PACKAGE_ROOT, "dist"), join(copy, "dist"), { recursive: true });
  cpSync(join(PACKAGE_ROOT, "package.json"), join(copy, "package.json"));
  // The peers an app installs; `sharp`, the optional one, deliberately not.
  for (const peer of ["plumix", "drizzle-orm"]) {
    symlinkSync(
      realpathSync(join(PACKAGE_ROOT, "node_modules", peer)),
      join(modules, peer),
    );
  }
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("the runtime installs without sharp, and images().connect names it when missing", async () => {
  const { stdout } = await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { images, diskStorage } = await import("@plumix/runtime-node");
       console.log(typeof diskStorage);
       try { images().connect({}); console.log("connected"); }
       catch (error) { console.log(error.name + ": " + error.message); }`,
    ],
    { cwd: dir, env: CLI_ENV, timeout: 30_000 },
  );
  const lines = stdout.trim().split("\n");
  expect(lines[0]).toBe("function");
  expect(lines[1]).toMatch(/^ImagesError: .*`sharp`.*not installed/);
  expect(lines[1]).not.toBe("connected");
}, 60_000);
