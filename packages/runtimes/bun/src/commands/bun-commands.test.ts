import { describe, expect, test } from "vitest";

import { buildCommand } from "./build.js";
import { bunCommands } from "./bun-commands.js";
import { devCommand } from "./dev.js";
import { diagnose } from "./diagnose.js";
import { migrations } from "./migrations.js";

describe("bunCommands", () => {
  test("refuses a scope without Bun, naming `bun --bun` as the fix", () => {
    expect(() => bunCommands({})).toThrow(
      expect.objectContaining({
        code: "bun_required",
        hint: "Run the command through Bun: `bun --bun plumix <command>`.",
      }),
    );
  });

  test("on Bun, hands the CLI its dev and build commands, migrations and diagnose", () => {
    const module = bunCommands(globalThis);

    expect(module).toEqual({
      commands: { dev: devCommand, build: buildCommand },
      migrations,
      diagnose,
    });
  });
});
