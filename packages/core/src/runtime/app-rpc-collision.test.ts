import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

const stubAdapter = {
  name: "test" as const,
  buildFetchHandler: () => () => new Response("stub"),
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: { index: () => null } });

describe("buildApp — RPC plugin-id collisions", () => {
  // `constructor` passes registration (it's not a core namespace) but would
  // shadow a member of the merged router object, so buildApp must reject it —
  // the boot-time guard that replaced the old `pluginId in appRouter` check.
  test("rejects plugin id `constructor`, which would shadow the merged router", async () => {
    const plugin = definePlugin("constructor", (ctx) => {
      ctx.registerRpcRouter({});
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [plugin],
        }),
      ),
    ).rejects.toThrow(
      /Plugin id "constructor" collides with a core RPC namespace at buildApp/,
    );
  });
});
