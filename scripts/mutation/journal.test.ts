import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

import { restore, save } from "./journal.ts";

let pkg: string;
beforeEach(() => {
  pkg = mkdtempSync(path.join(tmpdir(), "journal-"));
  mkdirSync(path.join(pkg, "src"));
  writeFileSync(path.join(pkg, "src/a.ts"), "export const a = 1;\n");
});
afterEach(() => {
  rmSync(pkg, { recursive: true, force: true });
});

test("puts back the bytes a target had before the run", () => {
  save(pkg, ["src/a.ts"]);
  writeFileSync(path.join(pkg, "src/a.ts"), "instrumented");

  restore(pkg);

  expect(readFileSync(path.join(pkg, "src/a.ts"), "utf8")).toBe(
    "export const a = 1;\n",
  );
});

test("a restore with nothing journaled changes nothing", () => {
  save(pkg, ["src/a.ts"]);
  restore(pkg);
  writeFileSync(path.join(pkg, "src/a.ts"), "edited after the run");

  expect(restore(pkg)).toBe(0);
  expect(readFileSync(path.join(pkg, "src/a.ts"), "utf8")).toBe(
    "edited after the run",
  );
});

test("removes the setup files the Vitest runner leaves in the package", () => {
  writeFileSync(path.join(pkg, "stryker-setup-0.js"), "");
  writeFileSync(path.join(pkg, "stryker-setup-12.js"), "");
  save(pkg, ["src/a.ts"]);

  restore(pkg);

  expect(existsSync(path.join(pkg, "stryker-setup-0.js"))).toBe(false);
  expect(existsSync(path.join(pkg, "stryker-setup-12.js"))).toBe(false);
});
