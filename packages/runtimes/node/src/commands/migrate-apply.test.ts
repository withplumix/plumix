import type { CommandContext, PlumixApp } from "plumix";
import { createDispatcherHarness } from "plumix/test";
import { beforeAll, describe, expect, test } from "vitest";

import { migrateApplyCommand } from "./migrate-apply.js";

let base: PlumixApp;

beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

function context(database: PlumixApp["config"]["database"]): CommandContext {
  return {
    app: { ...base, config: { ...base.config, database } },
    cwd: "/tmp/fake",
    configPath: "/tmp/fake/plumix.config.ts",
    argv: [],
    runtimeMigrate: {},
  };
}

describe("migrate apply", () => {
  test("refuses a database slot it cannot open, naming the slot it found", () => {
    const ctx = context({ kind: "libsql", connect: () => ({ db: {} }) });
    expect(() => migrateApplyCommand.run(ctx)).toThrow(
      /database slot is "libsql"/,
    );
  });
});
