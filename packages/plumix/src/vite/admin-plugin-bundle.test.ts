import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { definePlugin } from "@plumix/core";

import { resolveAndValidateEntry } from "./admin-plugin-bundle.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(resolve(tmpdir(), "plumix-assembler-"));
  await mkdir(resolve(workspace, "src"), { recursive: true });
  await writeFile(resolve(workspace, "src/admin.ts"), "// fixture");
});

afterEach(async () => {
  // Tests create a tiny tree under tmpdir; rely on OS cleanup.
});

const plugin = (entry: string) =>
  definePlugin("test", () => undefined, { adminEntry: entry });

describe("resolveAndValidateEntry", () => {
  test("resolves a relative path against the project root", async () => {
    const out = await resolveAndValidateEntry(
      plugin("./src/admin.ts") as Parameters<typeof resolveAndValidateEntry>[0],
      workspace,
    );
    expect(out).toBe(resolve(workspace, "src/admin.ts"));
  });

  test("accepts an absolute path inside the project root", async () => {
    const abs = resolve(workspace, "src/admin.ts");
    const out = await resolveAndValidateEntry(
      plugin(abs) as Parameters<typeof resolveAndValidateEntry>[0],
      workspace,
    );
    expect(out).toBe(abs);
  });

  test("rejects a relative path that escapes the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("../../etc/passwd") as Parameters<
          typeof resolveAndValidateEntry
        >[0],
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("rejects an absolute path outside the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("/etc/passwd") as Parameters<typeof resolveAndValidateEntry>[0],
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("throws a friendly error if the file doesn't exist", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("./src/nope.ts") as Parameters<
          typeof resolveAndValidateEntry
        >[0],
        workspace,
      ),
    ).rejects.toThrow(/file was not found/);
  });
});
