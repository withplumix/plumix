import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";
import { plumix } from "./define-config.js";

const stubAdapter = {
  name: "test" as const,
  handler: {},
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: [fallback(() => null)] });

describe("buildApp — plugin schema collisions", () => {
  test("rejects a plugin that redefines a core table", async () => {
    const misbehaving = definePlugin("collides", () => undefined, {
      schema: { users: { fake: true } },
      schemaModule: "@example/collides/schema",
    });

    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [misbehaving],
        }),
      ),
    ).rejects.toThrow(/redefines schema export "users"/);
  });

  test("rejects two plugins that export the same table name", async () => {
    const a = definePlugin("a", () => undefined, {
      schema: { landing_pages: { fake: "a" } },
      schemaModule: "@example/a/schema",
    });
    const b = definePlugin("b", () => undefined, {
      schema: { landing_pages: { fake: "b" } },
      schemaModule: "@example/b/schema",
    });

    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [a, b],
        }),
      ),
    ).rejects.toThrow(/Plugin "b" redefines schema export "landing_pages"/);
  });
});
