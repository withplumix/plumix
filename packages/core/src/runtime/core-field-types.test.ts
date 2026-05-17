import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { buildApp } from "./app.js";

const baseConfig = {
  runtime: {
    name: "test",
    buildFetchHandler: () => () => new Response("stub", { status: 500 }),
  },
  database: {
    kind: "test",
    connect: () => ({ db: {} }),
  },
  auth: auth({
    passkey: {
      rpName: "Plumix Test",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
  }),
};

function pluginWithBlock(name: string, attrType: string) {
  const id = `test-plugin-${name.replace(/[^a-z0-9]/g, "")}`;
  return definePlugin(id, (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name,
        title: name,
        attributes: {
          sample: { type: attrType, default: null },
        },
        schema: () =>
          Promise.resolve({
            name,
            parseHTML: () => [],
            renderHTML: () => ["div", 0],
          } as never),
        component: () => Promise.resolve(() => null),
      }),
    );
  });
}

describe("buildApp accepts canonical core field types on block attributes", () => {
  test("core/heading's level: { type: 'select', ... } passes validation", async () => {
    // `headingBlock` is in `coreBlocks` with `attributes.level.type = "select"`.
    // Without the core-field-types seed in the validation set, buildApp would
    // throw `unknown_attribute_type` here.
    await expect(buildApp(plumix(baseConfig))).resolves.toBeDefined();
  });

  test.each(["boolean", "link", "url", "checkbox", "number"])(
    "core type %s is accepted on a plugin block attribute",
    async (type) => {
      await expect(
        buildApp(
          plumix({
            ...baseConfig,
            plugins: [pluginWithBlock(`test/${type}-block`, type)],
          }),
        ),
      ).resolves.toBeDefined();
    },
  );

  test("an unknown attribute type still throws unknown_attribute_type", async () => {
    await expect(
      buildApp(
        plumix({
          ...baseConfig,
          plugins: [pluginWithBlock("test/exotic-block", "color-wheel-3d")],
        }),
      ),
    ).rejects.toThrow(/unknown_attribute_type|color-wheel-3d/);
  });
});
