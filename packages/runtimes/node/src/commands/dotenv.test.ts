import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createDotenvLoader } from "./dotenv.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-dotenv-"));
  file = join(dir, ".env");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createDotenvLoader", () => {
  test("sets what the file carries; a variable the shell already set wins", () => {
    const env: NodeJS.ProcessEnv = { FROM_SHELL: "shell" };
    writeFileSync(file, "FROM_FILE=file\nFROM_SHELL=file\n");

    createDotenvLoader(env)(file);

    expect(env).toEqual({ FROM_SHELL: "shell", FROM_FILE: "file" });
  });

  test("applied again after an edit, replaces and removes the keys it set and leaves the shell's alone", () => {
    const env: NodeJS.ProcessEnv = { FROM_SHELL: "shell" };
    const load = createDotenvLoader(env);
    writeFileSync(file, "A=1\nB=1\nFROM_SHELL=file\n");
    load(file);
    writeFileSync(file, "A=2\nC=3\nFROM_SHELL=file\n");

    load(file);

    expect(env).toEqual({ FROM_SHELL: "shell", A: "2", C: "3" });
  });

  test("a missing file applies nothing, and a file that goes missing withdraws what it set", () => {
    const env: NodeJS.ProcessEnv = { FROM_SHELL: "shell" };
    const load = createDotenvLoader(env);

    load(file);
    expect(env).toEqual({ FROM_SHELL: "shell" });

    writeFileSync(file, "A=1\n");
    load(file);
    rmSync(file);
    load(file);
    expect(env).toEqual({ FROM_SHELL: "shell" });
  });
});
