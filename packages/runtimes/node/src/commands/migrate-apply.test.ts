import type { CommandContext, PlumixApp } from "plumix";
import { describe, expect, test } from "vitest";

import { migrateApplyCommand } from "./migrate-apply.js";

function context(app: unknown): CommandContext {
  return {
    app: app as PlumixApp,
    cwd: "/tmp/fake",
    configPath: "/tmp/fake/plumix.config.ts",
    argv: [],
    runtimeMigrate: {},
  };
}

describe("migrate apply", () => {
  test("refuses a database slot it cannot open, naming the slot it found", () => {
    const ctx = context({ config: { database: { kind: "libsql" } } });
    expect(() => migrateApplyCommand.run(ctx)).toThrow(
      /database slot is "libsql"/,
    );
  });
});
