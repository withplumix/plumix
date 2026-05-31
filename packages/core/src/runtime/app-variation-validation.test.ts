import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

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

describe("buildApp — block variation boot validation", () => {
  test("rejects a plugin variation whose innerBlocks reference an unknown block", async () => {
    const badPlugin = definePlugin("bad-variations", (ctx) => {
      ctx.registerBlock(
        defineBlock({
          name: "x-test/group",
          title: "Test Group",
          inputs: [{ name: "content", type: "slot" }],
          render: () => null,
          variations: [
            {
              slug: "with-ghost",
              title: "With ghost",
              innerBlocks: [{ id: "g1", name: "core/ghost", attrs: {} }],
            },
          ],
        }),
      );
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [badPlugin],
        }),
      ),
    ).rejects.toThrow(
      /Variation "with-ghost" of "x-test\/group" at innerBlocks\[0\] references unknown block "core\/ghost"/,
    );
  });
});
