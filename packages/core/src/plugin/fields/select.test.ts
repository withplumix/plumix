import { describe, expect, expectTypeOf, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import { select } from "./index.js";

describe("select() fluent builder — single value", () => {
  test("select(key).options([...]) compiles to a select definition with derived labels", () => {
    const field = select("size")
      .options([
        { value: "s", label: "Small" },
        { value: "m", label: "Medium" },
      ])
      .build();
    expect(field).toMatchObject({
      key: "size",
      label: "Size",
      type: "string",
      inputType: "select",
      options: [
        { value: "s", label: "Small" },
        { value: "m", label: "Medium" },
      ],
    });
  });

  test("string shorthand options humanize into labels", () => {
    const field = select("layout").options(["standard", "videoHero"]).build();
    expect(field.options).toEqual([
      { value: "standard", label: "Standard" },
      { value: "videoHero", label: "Video hero" },
    ]);
  });

  test("universal chain carries every option into the definition", () => {
    const sanitize = (value: "a" | "b"): "a" | "b" => value;
    const validate = (): true => true;
    const field = select("tone")
      .options(["a", "b"])
      .label("Tone of voice")
      .description("Sets the copy register.")
      .default("a")
      .required()
      .span(6)
      .capability("seo:manage")
      .showInApi()
      .sanitize(sanitize)
      .validate(validate)
      .build();

    expect(field).toMatchObject({
      key: "tone",
      inputType: "select",
      type: "string",
      label: "Tone of voice",
      description: "Sets the copy register.",
      default: "a",
      required: true,
      span: 6,
      capability: "seo:manage",
      showInApi: true,
    });
    expect(field.sanitize).toBe(sanitize);
    expect(field.validate).toBe(validate);
  });

  test("chains are immutable — a shared base forks without aliasing", () => {
    const base = select("shared").options(["x", "y"]);
    const a = base.label("A").required();
    const b = base.label("B");

    expect(a.build()).toMatchObject({ label: "A", required: true });
    expect(b.build()).toMatchObject({ label: "B" });
    expect(b.build().required).toBeUndefined();
    expect(base.build()).toMatchObject({ label: "Shared" });
  });
});

describe("select() appearance — single value", () => {
  test(".appearance() carries the pure-UI axis into the definition", () => {
    const field = select("tone")
      .options(["a", "b"])
      .appearance("radio")
      .build();
    expect(field.appearance).toBe("radio");
    // Appearance never changes the value shape.
    expect(field).toMatchObject({ type: "string", inputType: "select" });
  });
});

describe("select().multiple() — cardinality axis", () => {
  test(".multiple() flips storage to a json array and marks the definition", () => {
    const field = select("tags").options(["news", "sport"]).multiple().build();
    expect(field).toMatchObject({
      type: "json",
      inputType: "select",
      multiple: true,
    });
    // An appearance chained before the cardinality flip still compiles out.
    expect(
      select("t").options(["a"]).appearance("buttons").multiple().build()
        .appearance,
    ).toBe("buttons");
  });

  test(".multiple() carries the option-membership sanitizer (multiselect parity)", () => {
    const field = select("tags").options(["a", "b", "c"]).multiple().build();
    expect(field.sanitize?.([])).toEqual([]);
    expect(field.sanitize?.(["a", "c"])).toEqual(["a", "c"]);
    expect(field.sanitize?.(["a", "a", "b"])).toEqual(["a", "b"]);
    expect(() => field.sanitize?.(["a", "z"])).toThrow();
    expect(() => field.sanitize?.([1])).toThrow();
    expect(() => field.sanitize?.("a")).toThrow();
    expect(() => field.sanitize?.(null)).toThrow();
  });

  test("a custom .sanitize() replaces the membership default", () => {
    const custom = (value: readonly ("a" | "b")[]): readonly ("a" | "b")[] =>
      value;
    const field = select("tags")
      .options(["a", "b"])
      .multiple()
      .sanitize(custom)
      .build();
    expect(field.sanitize).toBe(custom);
  });

  test("single-value fields ship no default sanitizer", () => {
    const field = select("size").options(["s", "m"]).build();
    expect(field.sanitize).toBeUndefined();
    expect(field.multiple).toBeUndefined();
  });

  test("selection-count .max() is available only after .multiple()", () => {
    const field = select("tags")
      .options(["a", "b", "c"])
      .multiple()
      .max(2)
      .build();
    expect(field.max).toBe(2);

    // @ts-expect-error — .max() is a selection count; single-value fields have none.
    select("size").options(["s", "m"]).max(2);
  });

  test(".default() takes an array after .multiple(); cardinality precedes narrowing", () => {
    const field = select("tags")
      .options(["a", "b"])
      .multiple()
      .default(["a"])
      .build();
    expect(field.default).toEqual(["a"]);

    // @ts-expect-error — scalar default is a single-value shape.
    select("tags").options(["a", "b"]).multiple().default("a");
    // @ts-expect-error — "z" is not in the option list.
    select("tags").options(["a", "b"]).multiple().default(["z"]);
    // @ts-expect-error — cardinality must be declared before narrowing calls.
    select("tags").options(["a", "b"]).default("a").multiple();
  });

  test("phantom value flips to a readonly array; .required()/.default() narrow", () => {
    const _multi = select("tags").options(["a", "b"]).multiple();
    expectTypeOf<(typeof _multi)["_value"]>().toEqualTypeOf<
      readonly ("a" | "b")[] | undefined
    >();

    const _required = select("tags").options(["a", "b"]).multiple().required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<
      readonly ("a" | "b")[]
    >();
  });

  test("appearance, multiple, and max survive the manifest wire projection", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("choices", {
        label: "Choices",
        fields: [
          select("tone").options(["a", "b"]).appearance("buttons"),
          select("tags").options(["a", "b", "c"]).multiple().max(2),
        ],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    const [single, multi] = manifest.settingsGroups[0]?.fields ?? [];
    expect(single).toMatchObject({
      key: "tone",
      inputType: "select",
      type: "string",
      appearance: "buttons",
    });
    expect(multi).toMatchObject({
      key: "tags",
      inputType: "select",
      type: "json",
      multiple: true,
      max: 2,
    });
    // Server-only callbacks (the membership sanitizer) never reach the wire.
    for (const value of Object.values(multi ?? {})) {
      expect(typeof value).not.toBe("function");
    }
  });

  test("illegal appearance/cardinality combinations are compile errors", () => {
    // Legal: buttons works on both cardinalities; checkboxes is multi-only.
    select("t").options(["a"]).appearance("select");
    select("t").options(["a"]).appearance("buttons");
    select("t").options(["a"]).multiple().appearance("buttons");
    select("t").options(["a"]).multiple().appearance("checkboxes");
    select("t").options(["a"]).appearance("buttons").multiple();

    // @ts-expect-error — checkboxes is a multi-value control.
    select("t").options(["a"]).appearance("checkboxes");
    // @ts-expect-error — radio is a single-value control.
    select("t").options(["a"]).multiple().appearance("radio");
    // @ts-expect-error — the dropdown has no multi-value counterpart.
    select("t").options(["a"]).multiple().appearance("select");
    // @ts-expect-error — a radio group can't hold multiple selections.
    select("t").options(["a"]).appearance("radio").multiple();
    // @ts-expect-error — the dropdown has no multi-value counterpart.
    select("t").options(["a"]).appearance("select").multiple();
  });
});

describe("select() phantom value typing — single value", () => {
  test(".options() infers the option literal union; .required()/.default() narrow", () => {
    const _unadorned = select("size").options(["s", "m", "l"]);
    expectTypeOf<(typeof _unadorned)["_value"]>().toEqualTypeOf<
      "s" | "m" | "l" | undefined
    >();

    const _mixed = select("size").options([
      "s",
      { value: "m", label: "Medium" },
    ]);
    expectTypeOf<(typeof _mixed)["_value"]>().toEqualTypeOf<
      "s" | "m" | undefined
    >();

    const _required = select("size").options(["s", "m"]).required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<"s" | "m">();

    const _defaulted = select("size").options(["s", "m"]).default("s");
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<"s" | "m">();

    // .default() only accepts a declared option value.
    // @ts-expect-error — "xl" is not in the option list.
    select("size").options(["s", "m"]).default("xl");
  });

  test("phantom key + stored shape feed the contribution fold", () => {
    // `_key` carries the literal; `_stored` mirrors the chassis rules —
    // `.default()` applies at decode time (storage can still lack the
    // key), `.required()` is write-enforced so storage narrows too.
    const _plain = select("size").options(["s", "m"]);
    expectTypeOf<(typeof _plain)["_key"]>().toEqualTypeOf<"size">();
    expectTypeOf<(typeof _plain)["_stored"]>().toEqualTypeOf<
      "s" | "m" | undefined
    >();

    const _defaulted = select("size").options(["s", "m"]).default("s");
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<"s" | "m">();
    expectTypeOf<(typeof _defaulted)["_stored"]>().toEqualTypeOf<
      "s" | "m" | undefined
    >();

    const _required = select("size").options(["s", "m"]).required();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<"s" | "m">();

    const _multi = select("tags").options(["a", "b"]).multiple().required();
    expectTypeOf<(typeof _multi)["_stored"]>().toEqualTypeOf<
      readonly ("a" | "b")[]
    >();
  });

  test(".sanitize()/.validate() callbacks receive the narrowed union", () => {
    select("size")
      .options(["s", "m"])
      .sanitize((value) => {
        expectTypeOf(value).toEqualTypeOf<"s" | "m">();
        return value;
      });
  });
});
