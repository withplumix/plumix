import { describe, expect, expectTypeOf, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import { toggle } from "./index.js";

describe("toggle() fluent builder", () => {
  test("toggle(key) compiles to a boolean toggle definition with a derived label", () => {
    const field = toggle("featured").build();
    expect(field).toMatchObject({
      key: "featured",
      label: "Featured",
      type: "boolean",
      inputType: "toggle",
    });
  });

  test(".onText()/.offText() carry the switch state labels", () => {
    const field = toggle("published").onText("Live").offText("Draft").build();
    expect(field.onText).toBe("Live");
    expect(field.offText).toBe("Draft");
  });

  test("universal chain carries every option into the definition", () => {
    const field = toggle("featured")
      .label("Feature this entry")
      .description("Pins the entry to the homepage.")
      .default(false)
      .span(6)
      .capability("entries:feature")
      .showInApi()
      .build();
    expect(field).toMatchObject({
      key: "featured",
      label: "Feature this entry",
      description: "Pins the entry to the homepage.",
      default: false,
      span: 6,
      capability: "entries:feature",
      showInApi: true,
    });
  });

  test("chains are immutable — a shared base forks without aliasing", () => {
    const base = toggle("shared").onText("On");
    const a = base.default(true);
    const b = base.offText("Off");
    expect(a.build()).toMatchObject({ onText: "On", default: true });
    expect(b.build()).toMatchObject({ onText: "On", offText: "Off" });
    expect(b.build().default).toBeUndefined();
    expect(base.build().offText).toBeUndefined();
  });

  test("reads as boolean | undefined; .required()/.default() narrow", () => {
    const _unadorned = toggle("featured");
    expectTypeOf<(typeof _unadorned)["_value"]>().toEqualTypeOf<
      boolean | undefined
    >();

    const _defaulted = toggle("featured").default(false);
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<boolean>();

    const _required = toggle("featured").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<boolean>();
  });

  test("phantom key + stored shape feed the contribution fold", () => {
    const _plain = toggle("featured");
    expectTypeOf<(typeof _plain)["_key"]>().toEqualTypeOf<"featured">();
    expectTypeOf<(typeof _plain)["_stored"]>().toEqualTypeOf<
      boolean | undefined
    >();

    // .default() narrows reads only; .required() narrows storage too.
    const _defaulted = toggle("featured").default(false);
    expectTypeOf<(typeof _defaulted)["_stored"]>().toEqualTypeOf<
      boolean | undefined
    >();
    const _required = toggle("featured").required();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<boolean>();
  });

  test("on/off text survives the manifest wire projection", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("flags", {
        label: "Flags",
        fields: [toggle("published").onText("Live").offText("Draft")],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "published",
      inputType: "toggle",
      type: "boolean",
      onText: "Live",
      offText: "Draft",
    });
  });
});
