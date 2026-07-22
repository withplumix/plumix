import { describe, expect, expectTypeOf, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import { isFieldVisible } from "./condition.js";
import { number, range, repeater, select, text, toggle, url } from "./index.js";

describe("condition authoring — visibleWhen / orVisibleWhen", () => {
  test("visibleWhen(...rules) compiles one AND group of wire rules", () => {
    const layout = select("layout").options(["standard", "video"]);
    const field = url("videoUrl")
      .visibleWhen(layout.is("video"), layout.isNotEmpty())
      .build();
    expect(field.visibleWhen).toEqual([
      [
        { key: "layout", op: "eq", value: "video" },
        { key: "layout", op: "not_empty" },
      ],
    ]);
  });

  test("each orVisibleWhen(...rules) appends an OR group", () => {
    const layout = select("layout").options(["standard", "video"]);
    const kicker = text("kicker");
    const field = text("caption")
      .visibleWhen(layout.is("video"))
      .orVisibleWhen(kicker.isNot("plain"), kicker.isEmpty())
      .build();
    expect(field.visibleWhen).toEqual([
      [{ key: "layout", op: "eq", value: "video" }],
      [
        { key: "kicker", op: "neq", value: "plain" },
        { key: "kicker", op: "empty" },
      ],
    ]);
  });

  test("a chain without visibleWhen compiles no condition", () => {
    expect(text("plain").build().visibleWhen).toBeUndefined();
  });

  test("numeric drivers author gt / lt rules", () => {
    const rating = number("rating");
    expect(rating.gt(3)).toEqual({ key: "rating", op: "gt", value: 3 });
    expect(rating.lt(5)).toEqual({ key: "rating", op: "lt", value: 5 });
    const volume = range("volume");
    expect(volume.gt(10)).toEqual({ key: "volume", op: "gt", value: 10 });
  });

  test("toggle drivers author isOn / isOff", () => {
    const featured = toggle("featured");
    expect(featured.isOn()).toEqual({ key: "featured", op: "eq", value: true });
    // `neq true`, not `eq false`: an unset toggle renders as off, so a
    // dependent behind `.isOff()` must show for it too.
    expect(featured.isOff()).toEqual({
      key: "featured",
      op: "neq",
      value: true,
    });
  });

  test("multi-select drivers author containment and count rules", () => {
    const tags = select("tags").options(["promo", "new"]).multiple();
    expect(tags.contains("promo")).toEqual({
      key: "tags",
      op: "contains",
      value: "promo",
    });
    expect(tags.notContains("new")).toEqual({
      key: "tags",
      op: "not_contains",
      value: "new",
    });
    expect(tags.countGt(1)).toEqual({ key: "tags", op: "count_gt", value: 1 });
    expect(tags.countLt(3)).toEqual({ key: "tags", op: "count_lt", value: 3 });
  });

  test("condition comparands are typed against the driver", () => {
    const _layout = select("layout").options(["standard", "video"]);
    expectTypeOf<Parameters<typeof _layout.is>[0]>().toEqualTypeOf<
      "standard" | "video"
    >();

    const _tags = select("tags").options(["promo", "new"]).multiple();
    expectTypeOf<Parameters<typeof _tags.contains>[0]>().toEqualTypeOf<
      "promo" | "new"
    >();

    // Containment/count operators require `.multiple()` — a single-value
    // chain's `this` never satisfies their gate.
    const single = select("layout").options(["standard", "video"]);
    // @ts-expect-error contains is multi-value only
    single.contains("standard");
    // @ts-expect-error count operators are multi-value only
    single.countGt(1);

    // Numeric comparisons only exist on numeric drivers.
    expectTypeOf(text("subtitle")).not.toHaveProperty("gt");

    const _rating = number("rating");
    expectTypeOf<Parameters<typeof _rating.is>[0]>().toEqualTypeOf<number>();
    const _featured = toggle("featured");
    expectTypeOf<Parameters<typeof _featured.is>[0]>().toEqualTypeOf<boolean>();
  });

  test("visibleWhen rides the manifest wire projection", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      const layout = select("layout").options(["standard", "video"]);
      ctx.registerSettingsGroup("video", {
        label: "Video",
        fields: [layout, url("videoUrl").visibleWhen(layout.is("video"))],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    const wireField = manifest.settingsGroups[0]?.fields.find(
      (f) => f.key === "videoUrl",
    );
    expect(wireField?.visibleWhen).toEqual([
      [{ key: "layout", op: "eq", value: "video" }],
    ]);
  });

  test("registration rejects a condition whose driver is not in the same box", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      const layout = select("layout").options(["standard", "video"]);
      ctx.registerSettingsGroup("video", {
        label: "Video",
        // `layout` never joins the box — the rule points at a ghost.
        fields: [url("videoUrl").visibleWhen(layout.is("video"))],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /"videoUrl" condition references "layout", which is not a field in the same box/,
    );
  });

  test("repeater subfields reject visibleWhen — row-scoped conditions are unsupported", () => {
    const hasCta = toggle("hasCta");
    expect(() =>
      repeater({
        key: "sections",
        label: "Sections",
        subFields: [hasCta, url("ctaUrl").visibleWhen(hasCta.isOn())],
      }),
    ).toThrow(/does not support visibleWhen/);
  });

  test("registration accepts a driver declared after its dependent", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      const layout = select("layout").options(["standard", "video"]);
      ctx.registerSettingsGroup("video", {
        label: "Video",
        fields: [url("videoUrl").visibleWhen(layout.is("video")), layout],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).resolves.toBeDefined();
  });
});

describe("isFieldVisible — grouping", () => {
  test("a field without a condition is always visible", () => {
    expect(isFieldVisible({}, {})).toBe(true);
    expect(isFieldVisible({ visibleWhen: [] }, {})).toBe(true);
  });

  test("a single eq rule matches the driver value", () => {
    const field = {
      visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
    } as const;
    expect(isFieldVisible(field, { layout: "video" })).toBe(true);
    expect(isFieldVisible(field, { layout: "standard" })).toBe(false);
    expect(isFieldVisible(field, {})).toBe(false);
  });

  test("neq is the negation of eq, including for absent drivers", () => {
    const field = {
      visibleWhen: [[{ key: "layout", op: "neq", value: "video" }]],
    } as const;
    expect(isFieldVisible(field, { layout: "standard" })).toBe(true);
    expect(isFieldVisible(field, { layout: "video" })).toBe(false);
    expect(isFieldVisible(field, {})).toBe(true);
  });

  test("rules inside one group AND together", () => {
    const field = {
      visibleWhen: [
        [
          { key: "layout", op: "eq", value: "video" },
          { key: "featured", op: "eq", value: true },
        ],
      ],
    } as const;
    expect(isFieldVisible(field, { layout: "video", featured: true })).toBe(
      true,
    );
    expect(isFieldVisible(field, { layout: "video", featured: false })).toBe(
      false,
    );
  });

  test("empty matches absent, null, blank-string, and empty-array drivers", () => {
    const field = {
      visibleWhen: [[{ key: "hero", op: "empty" }]],
    } as const;
    expect(isFieldVisible(field, {})).toBe(true);
    expect(isFieldVisible(field, { hero: null })).toBe(true);
    expect(isFieldVisible(field, { hero: "" })).toBe(true);
    expect(isFieldVisible(field, { hero: [] })).toBe(true);
    expect(isFieldVisible(field, { hero: "media-1" })).toBe(false);
    expect(isFieldVisible(field, { hero: false })).toBe(false);
    expect(isFieldVisible(field, { hero: 0 })).toBe(false);
  });

  test("not_empty is the negation of empty", () => {
    const field = {
      visibleWhen: [[{ key: "hero", op: "not_empty" }]],
    } as const;
    expect(isFieldVisible(field, { hero: "media-1" })).toBe(true);
    expect(isFieldVisible(field, {})).toBe(false);
    expect(isFieldVisible(field, { hero: [] })).toBe(false);
  });

  test("gt / lt compare numeric drivers, including numeric form strings", () => {
    const gt = {
      visibleWhen: [[{ key: "rating", op: "gt", value: 3 }]],
    } as const;
    expect(isFieldVisible(gt, { rating: 4 })).toBe(true);
    expect(isFieldVisible(gt, { rating: 3 })).toBe(false);
    expect(isFieldVisible(gt, { rating: "4" })).toBe(true);
    expect(isFieldVisible(gt, { rating: "" })).toBe(false);
    expect(isFieldVisible(gt, {})).toBe(false);

    const lt = {
      visibleWhen: [[{ key: "rating", op: "lt", value: 3 }]],
    } as const;
    expect(isFieldVisible(lt, { rating: 2 })).toBe(true);
    expect(isFieldVisible(lt, { rating: 3 })).toBe(false);
    expect(isFieldVisible(lt, {})).toBe(false);
  });

  test("contains / not_contains test membership in multi-value drivers", () => {
    const field = {
      visibleWhen: [[{ key: "tags", op: "contains", value: "promo" }]],
    } as const;
    expect(isFieldVisible(field, { tags: ["promo", "new"] })).toBe(true);
    expect(isFieldVisible(field, { tags: ["new"] })).toBe(false);
    expect(isFieldVisible(field, {})).toBe(false);
    expect(isFieldVisible(field, { tags: "promo" })).toBe(false);

    const negated = {
      visibleWhen: [[{ key: "tags", op: "not_contains", value: "promo" }]],
    } as const;
    expect(isFieldVisible(negated, { tags: ["new"] })).toBe(true);
    expect(isFieldVisible(negated, { tags: ["promo"] })).toBe(false);
    expect(isFieldVisible(negated, {})).toBe(true);
  });

  test("count_gt / count_lt compare selection counts; absent counts as zero", () => {
    const gt = {
      visibleWhen: [[{ key: "tags", op: "count_gt", value: 1 }]],
    } as const;
    expect(isFieldVisible(gt, { tags: ["a", "b"] })).toBe(true);
    expect(isFieldVisible(gt, { tags: ["a"] })).toBe(false);
    expect(isFieldVisible(gt, {})).toBe(false);

    const lt = {
      visibleWhen: [[{ key: "tags", op: "count_lt", value: 2 }]],
    } as const;
    expect(isFieldVisible(lt, { tags: ["a"] })).toBe(true);
    expect(isFieldVisible(lt, {})).toBe(true);
    expect(isFieldVisible(lt, { tags: ["a", "b"] })).toBe(false);
  });

  test("eq compares array and object drivers structurally", () => {
    const arrays = {
      visibleWhen: [[{ key: "sizes", op: "eq", value: ["s", "m"] }]],
    } as const;
    expect(isFieldVisible(arrays, { sizes: ["s", "m"] })).toBe(true);
    expect(isFieldVisible(arrays, { sizes: ["m", "s"] })).toBe(false);
    expect(isFieldVisible(arrays, { sizes: ["s"] })).toBe(false);

    const objects = {
      visibleWhen: [
        [{ key: "cta", op: "eq", value: { url: "/x", newTab: true } }],
      ],
    } as const;
    expect(isFieldVisible(objects, { cta: { url: "/x", newTab: true } })).toBe(
      true,
    );
    expect(isFieldVisible(objects, { cta: { newTab: true, url: "/x" } })).toBe(
      true,
    );
    expect(isFieldVisible(objects, { cta: { url: "/y", newTab: true } })).toBe(
      false,
    );
  });

  test("groups OR together — any passing group shows the field", () => {
    const field = {
      visibleWhen: [
        [{ key: "layout", op: "eq", value: "video" }],
        [{ key: "featured", op: "eq", value: true }],
      ],
    } as const;
    expect(isFieldVisible(field, { layout: "standard", featured: true })).toBe(
      true,
    );
    expect(isFieldVisible(field, { layout: "video", featured: false })).toBe(
      true,
    );
    expect(isFieldVisible(field, { layout: "standard", featured: false })).toBe(
      false,
    );
  });
});
