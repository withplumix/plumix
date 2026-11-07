import { describe, expect, test } from "vitest";

import { settings } from "../../src/events-and-filters/subjects.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const changed: string[] = [];
const filtered: string[] = [];

const shop = definePlugin("shop", {
  setup: (ctx) => {
    ctx.registerSettingsGroup("shop", {
      label: "Shop",
      fields: [text("currency")],
    });
    ctx.registerSettingsGroup("shipping", {
      label: "Shipping",
      fields: [text("carrier")],
    });
    ctx.events.on(settings.for("shop").groupChanged, ({ group, set }) => {
      changed.push(`shop:${group}:${JSON.stringify(set)}`);
    });
    ctx.events.on(settings.groupChanged, ({ group }) => {
      changed.push(`every:${group}`);
    });
    // Added first, so only the scoped-first rule puts it second.
    ctx.filters.add(settings.rpc.get.output, (copy, { group }) => {
      filtered.push(`every:${group}`);
      return copy;
    });
    ctx.filters.add(settings.for("shop").rpc.get.output, (copy, { group }) => {
      filtered.push(`shop:${group}`);
      return copy;
    });
  },
});

const site = await testSite({ plugins: [shop] });

async function save(group: string, values: Record<string, string>) {
  const admin = site.actingAs("admin");
  const { etag } = await admin.rpc.settings.get({ group });
  await admin.rpc.settings.upsert({ group, values, ifMatch: etag });
}

describe("saving a settings group", () => {
  test("runs the group's handler and every group's handler", async () => {
    changed.length = 0;

    await save("shop", { currency: "EUR" });

    expect(changed.sort()).toEqual([
      "every:shop",
      'shop:shop:{"currency":"EUR"}',
    ]);
  });

  test("of another group runs only the handler for every group", async () => {
    changed.length = 0;

    await save("shipping", { carrier: "Post" });

    expect(changed).toEqual(["every:shipping"]);
  });
});

describe("reading a settings group", () => {
  test("runs the group's output filter before every group's", async () => {
    filtered.length = 0;

    await site.actingAs("admin").rpc.settings.get({ group: "shop" });

    expect(filtered).toEqual(["shop:shop", "every:shop"]);
  });

  test("of another group runs only the filter for every group", async () => {
    filtered.length = 0;

    await site.actingAs("admin").rpc.settings.get({ group: "shipping" });

    expect(filtered).toEqual(["every:shipping"]);
  });
});
