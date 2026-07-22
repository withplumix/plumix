import { describe, expect, expectTypeOf, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import {
  checkbox,
  color,
  date,
  datetime,
  email,
  entry,
  entryList,
  json,
  multiselect,
  number,
  radio,
  range,
  repeater,
  richtext,
  select,
  term,
  termList,
  text,
  textarea,
  time,
  url,
  user,
  userList,
} from "./index.js";

// One combined suite for the per-variant builder guarantees. The
// universal-chain + immutability behavior shared by every fluent
// builder is covered by `builder.test.ts` (string scalars as the
// reference); these tests focus on what each variant adds — per-type
// option chains, injected sanitizers, `.returns("date")`, and the
// factories still taking flat options (`select` / `radio` /
// `checkbox` / references).

describe("number() builder", () => {
  test("chains min/max/step/default into a number definition", () => {
    const field = number("rating").min(1).max(5).step(0.5).default(3).build();
    expect(field.key).toBe("rating");
    expect(field.label).toBe("Rating");
    expect(field.inputType).toBe("number");
    expect(field.type).toBe("number");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.step).toBe(0.5);
    expect(field.default).toBe(3);
  });

  test("universal chain carries through", () => {
    const field = number("rating")
      .label("Score")
      .placeholder("0–5")
      .required()
      .span(6)
      .build();
    expect(field).toMatchObject({
      label: "Score",
      placeholder: "0–5",
      required: true,
      span: 6,
    });
  });

  test("rejects text-shaped chains at the type level", () => {
    // `maxLength` belongs to text-shaped fields; `options` to select/radio.
    expectTypeOf(number("n")).not.toHaveProperty("maxLength");
    expectTypeOf(number("n")).not.toHaveProperty("options");
  });

  test("phantom typing: unadorned reads number | undefined; .required()/.default() narrow", () => {
    const _unadorned = number("n");
    expectTypeOf<(typeof _unadorned)["_key"]>().toEqualTypeOf<"n">();
    expectTypeOf<(typeof _unadorned)["_value"]>().toEqualTypeOf<
      number | undefined
    >();
    const _required = number("n").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<number>();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<number>();
    // `.default()` narrows the read type only — storage can lack the key.
    const _defaulted = number("n").default(3);
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<number>();
    expectTypeOf<(typeof _defaulted)["_stored"]>().toEqualTypeOf<
      number | undefined
    >();
  });
});

describe("date() builder", () => {
  test("chains ISO date bounds into a date definition", () => {
    const field = date("publishedOn")
      .label("Publish date")
      .min("2024-01-01")
      .max("2030-12-31")
      .default("2026-05-03")
      .build();
    expect(field.inputType).toBe("date");
    expect(field.type).toBe("string");
    expect(field.min).toBe("2024-01-01");
    expect(field.max).toBe("2030-12-31");
    expect(field.default).toBe("2026-05-03");
  });

  test("rejects numeric bounds and non-applicable chains at the type level", () => {
    // Date bounds are ISO strings, not numbers; `step` doesn't apply.
    expectTypeOf(date("d"))
      .toHaveProperty("min")
      .parameter(0)
      .toEqualTypeOf<string>();
    expectTypeOf(date("d")).not.toHaveProperty("step");
  });
});

describe("datetime() builder", () => {
  test("chains ISO bounds into a datetime definition", () => {
    const field = datetime("startsAt").min("2026-01-01T00:00").build();
    expect(field.inputType).toBe("datetime");
    expect(field.type).toBe("string");
    expect(field.label).toBe("Starts at");
    expect(field.min).toBe("2026-01-01T00:00");
  });

  test("rejects text-shaped chains at the type level", () => {
    // `placeholder` is a text-shaped option, not a datetime one.
    expectTypeOf(datetime("d")).not.toHaveProperty("placeholder");
  });
});

describe("time() builder", () => {
  test("chains HH:MM bounds into a time definition", () => {
    const field = time("opensAt").min("06:00").max("23:00").build();
    expect(field.inputType).toBe("time");
    expect(field.type).toBe("string");
    expect(field.min).toBe("06:00");
    expect(field.max).toBe("23:00");
  });

  test("rejects numeric bounds at the type level", () => {
    // `min` for `time` is an ISO string, not a number.
    expectTypeOf(time("t"))
      .toHaveProperty("min")
      .parameter(0)
      .toEqualTypeOf<string>();
  });
});

describe('.returns("date") on temporal builders', () => {
  test("carries returns onto the definition; default omits it", () => {
    expect(date("d").returns("date").build().returns).toBe("date");
    expect(datetime("d").returns("date").build().returns).toBe("date");
    expect(time("t").returns("date").build().returns).toBe("date");
    expect(date("d").build().returns).toBeUndefined();
  });

  test("phantom typing: ISO string by default, Date after .returns('date'), order-independent", () => {
    const _iso = date("d");
    expectTypeOf<(typeof _iso)["_value"]>().toEqualTypeOf<string | undefined>();

    const _projected = date("d").returns("date");
    expectTypeOf<(typeof _projected)["_value"]>().toEqualTypeOf<
      Date | undefined
    >();

    const _requiredFirst = datetime("d").required().returns("date");
    expectTypeOf<(typeof _requiredFirst)["_value"]>().toEqualTypeOf<Date>();

    const _returnsFirst = time("t").returns("date").required();
    expectTypeOf<(typeof _returnsFirst)["_value"]>().toEqualTypeOf<Date>();

    const _defaulted = date("d").default("2026-01-01").returns("date");
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<Date>();
  });

  test("phantom stored shape stays the ISO string through .returns('date')", () => {
    // `whereMeta` and the write contract keep typing on storage.
    const _projected = date("d").returns("date");
    expectTypeOf<(typeof _projected)["_stored"]>().toEqualTypeOf<
      string | undefined
    >();
    const _required = datetime("d").required().returns("date");
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<string>();
  });

  test(".sanitize()/.validate() stay typed on the stored ISO string even after .returns('date')", () => {
    date("d")
      .returns("date")
      .sanitize((value) => {
        expectTypeOf(value).toEqualTypeOf<string>();
        return value;
      })
      .validate((value) => {
        expectTypeOf(value).toEqualTypeOf<string>();
        return true;
      });
  });
});

describe("color() builder", () => {
  test("compiles with a derived label and a default hex sanitizer", () => {
    const field = color("brandColor").build();
    expect(field.inputType).toBe("color");
    expect(field.type).toBe("string");
    expect(field.label).toBe("Brand color");
    expect(field.sanitize).toBeTypeOf("function");
  });

  test("default sanitizer accepts hex shorthand and full form, lowercases", () => {
    const field = color("brand").build();
    expect(field.sanitize?.("#FFA500")).toBe("#ffa500");
    expect(field.sanitize?.("#abc")).toBe("#abc");
  });

  test("default sanitizer rejects non-hex values", () => {
    const field = color("brand").build();
    expect(() => field.sanitize?.("not-a-color")).toThrow();
    expect(() => field.sanitize?.("#xyz123")).toThrow();
    expect(() => field.sanitize?.(123)).toThrow();
    expect(() => field.sanitize?.(null)).toThrow();
  });

  test("custom .sanitize() replaces the default", () => {
    const custom = (v: string): string => v;
    const field = color("brand").sanitize(custom).build();
    expect(field.sanitize).toBe(custom);
  });

  test("rejects non-applicable chains at the type level", () => {
    // `min` doesn't apply to color.
    expectTypeOf(color("c")).not.toHaveProperty("min");
  });
});

describe("multiselect() builder", () => {
  test("pins inputType + json type and carries options", () => {
    const field = multiselect({
      key: "tags",
      label: "Tags",
      options: [
        { value: "news", label: "News" },
        { value: "sport", label: "Sport" },
      ],
    });
    expect(field.inputType).toBe("multiselect");
    expect(field.type).toBe("json");
    expect(field.options).toHaveLength(2);
    expect(field.sanitize).toBeTypeOf("function");
  });

  test("default sanitizer accepts subset of declared options and de-dupes", () => {
    const field = multiselect({
      key: "t",
      label: "t",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ],
    });
    expect(field.sanitize?.([])).toEqual([]);
    expect(field.sanitize?.(["a", "c"])).toEqual(["a", "c"]);
    expect(field.sanitize?.(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  test("default sanitizer rejects values outside the option list", () => {
    const field = multiselect({
      key: "t",
      label: "t",
      options: [{ value: "a", label: "A" }],
    });
    expect(() => field.sanitize?.(["a", "z"])).toThrow();
    expect(() => field.sanitize?.([1])).toThrow();
    expect(() => field.sanitize?.("a")).toThrow();
    expect(() => field.sanitize?.(null)).toThrow();
  });

  test("rejects non-applicable options at the type level", () => {
    multiselect({
      key: "t",
      label: "t",
      options: [{ value: "a", label: "A" }],
      // @ts-expect-error — `placeholder` doesn't apply to multiselect.
      placeholder: "pick",
    });
  });
});

describe("json() builder", () => {
  test("compiles to a json definition with a derived label", () => {
    const field = json("config").build();
    expect(field.inputType).toBe("json");
    expect(field.type).toBe("json");
    expect(field.label).toBe("Config");
  });

  test("forwards a custom .sanitize() and a json default", () => {
    const sanitize = (v: unknown): unknown => v;
    const field = json("x")
      .default({ theme: "dark" })
      .sanitize(sanitize)
      .build();
    expect(field.sanitize).toBe(sanitize);
    expect(field.default).toEqual({ theme: "dark" });
  });

  test("rejects non-json chains at the type level", () => {
    // `options` doesn't apply to json.
    expectTypeOf(json("x")).not.toHaveProperty("options");
  });
});

describe("range() builder", () => {
  test("chains bounds/step/default into a range definition", () => {
    const field = range("rating").min(1).max(5).step(0.5).default(3).build();
    expect(field.inputType).toBe("range");
    expect(field.type).toBe("number");
    expect(field.label).toBe("Rating");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.step).toBe(0.5);
    expect(field.default).toBe(3);
  });

  test("rejects missing bounds at registration time", () => {
    expect(() => range("r").build()).toThrowError(/min.*max/);
    expect(() => range("r").min(0).build()).toThrowError(/min.*max/);
    expect(() => range("r").max(10).build()).toThrowError(/min.*max/);
  });

  test("rejects min > max at registration time", () => {
    expect(() => range("r").min(10).max(5).build()).toThrowError(
      /min .* must be <= max/,
    );
  });

  test("default sanitizer enforces bounds and rejects NaN", () => {
    const field = range("r").min(0).max(100).build();
    expect(field.sanitize?.(50)).toBe(50);
    expect(() => field.sanitize?.(-1)).toThrow();
    expect(() => field.sanitize?.(101)).toThrow();
    expect(() => field.sanitize?.(Number.NaN)).toThrow();
    expect(() => field.sanitize?.("50")).toThrow();
  });

  test("custom .sanitize() replaces the default bounds sanitizer", () => {
    const custom = (v: number): number => v;
    const field = range("r").min(0).max(10).sanitize(custom).build();
    expect(field.sanitize).toBe(custom);
  });

  test("rejects non-applicable chains at the type level", () => {
    // `placeholder` doesn't apply to range.
    expectTypeOf(range("r")).not.toHaveProperty("placeholder");
  });
});

describe("select() builder", () => {
  test("requires options and pins discriminators", () => {
    const field = select({
      key: "size",
      label: "Size",
      options: [
        { value: "s", label: "Small" },
        { value: "m", label: "Medium" },
        { value: "l", label: "Large" },
      ],
    });
    expect(field.inputType).toBe("select");
    expect(field.type).toBe("string");
    expect(field.options).toHaveLength(3);
    expect(field.options[0]).toEqual({ value: "s", label: "Small" });
  });

  test("rejects text/number-shaped options at the type level", () => {
    select({
      key: "s",
      label: "s",
      options: [{ value: "a", label: "A" }],
      // @ts-expect-error — `maxLength` belongs to text-shaped fields.
      maxLength: 5,
    });

    // @ts-expect-error — `options` is required.
    select({ key: "s", label: "s" });
  });
});

describe("radio() builder", () => {
  test("requires options and pins discriminators", () => {
    const field = radio({
      key: "yesno",
      label: "Yes or no",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    });
    expect(field.inputType).toBe("radio");
    expect(field.type).toBe("string");
    expect(field.options).toHaveLength(2);
  });

  test("rejects options that don't apply at the type level", () => {
    radio({
      key: "r",
      label: "r",
      options: [{ value: "a", label: "A" }],
      // @ts-expect-error — `placeholder` doesn't apply to radio.
      placeholder: "pick",
    });
  });
});

describe("checkbox() builder", () => {
  test("pins inputType + type to boolean", () => {
    const field = checkbox({
      key: "subscribed",
      label: "Subscribe to newsletter",
      default: true,
    });
    expect(field.inputType).toBe("checkbox");
    expect(field.type).toBe("boolean");
    expect(field.default).toBe(true);
  });

  test("rejects non-boolean options at the type level", () => {
    checkbox({
      key: "c",
      label: "c",
      // @ts-expect-error — `placeholder` doesn't apply to checkbox.
      placeholder: "...",
    });

    checkbox({
      key: "c",
      label: "c",
      // @ts-expect-error — `options` doesn't apply to checkbox.
      options: [{ value: "a", label: "A" }],
    });
  });
});

describe("manifest round-trip across all built-in builders", () => {
  test("each builder produces a field that survives manifest serialization", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("everything", {
        label: "Everything",
        fields: [
          textarea("bio").label("Bio").maxLength(500),
          number("age").label("Age").min(0).max(120),
          email("contact").label("Contact"),
          url("website").label("Website"),
          select({
            key: "size",
            label: "Size",
            options: [{ value: "m", label: "M" }],
          }),
          radio({
            key: "yn",
            label: "Yes/No",
            options: [
              { value: "y", label: "Y" },
              { value: "n", label: "N" },
            ],
          }),
          checkbox({ key: "agreed", label: "Agreed", default: false }),
        ],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    const fields = manifest.settingsGroups[0]?.fields ?? [];
    expect(fields.map((f) => f.inputType)).toEqual([
      "textarea",
      "number",
      "email",
      "url",
      "select",
      "radio",
      "checkbox",
    ]);
    expect(fields.map((f) => f.type)).toEqual([
      "string",
      "number",
      "string",
      "string",
      "string",
      "string",
      "boolean",
    ]);
    // Per-variant config carries through to the wire shape.
    expect(fields[1]).toMatchObject({ min: 0, max: 120 });
    expect(fields[4]?.options).toEqual([{ value: "m", label: "M" }]);
    expect(fields[6]).toMatchObject({ default: false });
  });
});

describe("user() builder", () => {
  test("pins inputType + type and emits a user-kind referenceTarget", () => {
    const field = user({
      key: "owner",
      label: "Owner",
      roles: ["editor", "admin"],
    });
    expect(field.inputType).toBe("user");
    expect(field.type).toBe("string");
    expect(field.referenceTarget).toEqual({
      kind: "user",
      scope: { roles: ["editor", "admin"], includeDisabled: undefined },
    });
  });

  test("packages includeDisabled into the scope", () => {
    const field = user({
      key: "owner",
      label: "Owner",
      includeDisabled: true,
    });
    expect(field.referenceTarget.scope).toEqual({
      roles: undefined,
      includeDisabled: true,
    });
  });

  test("rejects non-applicable options at the type level", () => {
    user({
      key: "u",
      label: "u",
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });

    user({
      key: "u",
      label: "u",
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [user({ key: "owner", label: "Owner", roles: ["admin"] })],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    const projected = manifest.settingsGroups[0]?.fields[0];
    expect(projected).toMatchObject({
      key: "owner",
      inputType: "user",
      type: "string",
      referenceTarget: {
        kind: "user",
        scope: { roles: ["admin"] },
      },
    });
  });
});

describe("entry() builder", () => {
  test("pins inputType + type and emits an entry-kind referenceTarget", () => {
    const field = entry({
      key: "related",
      label: "Related post",
      entryTypes: ["post"],
    });
    expect(field.inputType).toBe("entry");
    expect(field.type).toBe("string");
    expect(field.referenceTarget).toEqual({
      kind: "entry",
      scope: { entryTypes: ["post"], includeTrashed: undefined },
    });
  });

  test("packages includeTrashed into the scope", () => {
    const field = entry({
      key: "related",
      label: "Related post",
      entryTypes: ["post"],
      includeTrashed: true,
    });
    expect(field.referenceTarget.scope).toEqual({
      entryTypes: ["post"],
      includeTrashed: true,
    });
  });

  test("rejects non-applicable options at the type level", () => {
    entry({
      key: "e",
      label: "e",
      entryTypes: ["post"],
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });

    entry({
      key: "e",
      label: "e",
      entryTypes: ["post"],
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          entry({
            key: "homepage",
            label: "Homepage",
            entryTypes: ["page"],
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "homepage",
      inputType: "entry",
      type: "string",
      referenceTarget: { kind: "entry", scope: { entryTypes: ["page"] } },
    });
  });
});

describe("term() builder", () => {
  test("pins inputType + type and emits a term-kind referenceTarget", () => {
    const field = term({
      key: "primary",
      label: "Primary category",
      termTaxonomies: ["category"],
    });
    expect(field.inputType).toBe("term");
    expect(field.type).toBe("string");
    expect(field.referenceTarget).toEqual({
      kind: "term",
      scope: { termTaxonomies: ["category"] },
    });
  });

  test("rejects non-applicable options at the type level", () => {
    term({
      key: "t",
      label: "t",
      termTaxonomies: ["category"],
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("classification", {
        label: "Classification",
        fields: [
          term({
            key: "section",
            label: "Section",
            termTaxonomies: ["category"],
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "section",
      inputType: "term",
      type: "string",
      referenceTarget: {
        kind: "term",
        scope: { termTaxonomies: ["category"] },
      },
    });
  });
});

describe("userList() builder", () => {
  test("pins inputType + json type and emits a multi user-kind referenceTarget", () => {
    const field = userList({
      key: "owners",
      label: "Owners",
      roles: ["editor", "admin"],
      max: 5,
    });
    expect(field.inputType).toBe("userList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(5);
    expect(field.referenceTarget).toEqual({
      kind: "user",
      scope: { roles: ["editor", "admin"], includeDisabled: undefined },
      multiple: true,
    });
  });

  test("packages includeDisabled into the scope and supports unbounded max", () => {
    const field = userList({
      key: "owners",
      label: "Owners",
      includeDisabled: true,
    });
    expect(field.max).toBeUndefined();
    expect(field.referenceTarget.scope).toEqual({
      roles: undefined,
      includeDisabled: true,
    });
  });

  test("rejects non-applicable options at the type level", () => {
    userList({
      key: "u",
      label: "u",
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });

    userList({
      key: "u",
      label: "u",
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves multi referenceTarget + max on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [
          userList({
            key: "owners",
            label: "Owners",
            roles: ["admin"],
            max: 3,
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "owners",
      inputType: "userList",
      type: "json",
      max: 3,
      referenceTarget: {
        kind: "user",
        scope: { roles: ["admin"] },
        multiple: true,
      },
    });
  });
});

describe("entryList() builder", () => {
  test("pins inputType + json type and emits a multi entry-kind referenceTarget", () => {
    const field = entryList({
      key: "related",
      label: "Related",
      entryTypes: ["post"],
      max: 5,
    });
    expect(field.inputType).toBe("entryList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(5);
    expect(field.referenceTarget).toEqual({
      kind: "entry",
      scope: { entryTypes: ["post"], includeTrashed: undefined },
      multiple: true,
    });
  });

  test("packages includeTrashed into the scope and supports unbounded max", () => {
    const field = entryList({
      key: "related",
      label: "Related",
      entryTypes: ["post", "page"],
      includeTrashed: true,
    });
    expect(field.max).toBeUndefined();
    expect(field.referenceTarget.scope).toEqual({
      entryTypes: ["post", "page"],
      includeTrashed: true,
    });
  });

  test("rejects non-applicable options at the type level", () => {
    entryList({
      key: "x",
      label: "x",
      entryTypes: ["post"],
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });

    entryList({
      key: "x",
      label: "x",
      entryTypes: ["post"],
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves multi referenceTarget + max on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          entryList({
            key: "related",
            label: "Related",
            entryTypes: ["post"],
            max: 4,
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "related",
      inputType: "entryList",
      type: "json",
      max: 4,
      referenceTarget: {
        kind: "entry",
        scope: { entryTypes: ["post"] },
        multiple: true,
      },
    });
  });
});

describe("termList() builder", () => {
  test("pins inputType + json type and emits a multi term-kind referenceTarget", () => {
    const field = termList({
      key: "tags",
      label: "Tags",
      termTaxonomies: ["tag"],
      max: 10,
    });
    expect(field.inputType).toBe("termList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(10);
    expect(field.referenceTarget).toEqual({
      kind: "term",
      scope: { termTaxonomies: ["tag"] },
      multiple: true,
    });
  });

  test("supports unbounded max", () => {
    const field = termList({
      key: "tags",
      label: "Tags",
      termTaxonomies: ["tag", "category"],
    });
    expect(field.max).toBeUndefined();
    expect(field.referenceTarget.scope).toEqual({
      termTaxonomies: ["tag", "category"],
    });
  });

  test("rejects non-applicable options at the type level", () => {
    termList({
      key: "x",
      label: "x",
      termTaxonomies: ["tag"],
      // @ts-expect-error — `placeholder` doesn't apply to a reference field.
      placeholder: "pick",
    });

    termList({
      key: "x",
      label: "x",
      termTaxonomies: ["tag"],
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves multi referenceTarget + max on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          termList({
            key: "tags",
            label: "Tags",
            termTaxonomies: ["tag"],
            max: 6,
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "tags",
      inputType: "termList",
      type: "json",
      max: 6,
      referenceTarget: {
        kind: "term",
        scope: { termTaxonomies: ["tag"] },
        multiple: true,
      },
    });
  });
});

describe("richtext() builder", () => {
  test("chains the allowlist arrays into a richtext definition", () => {
    const field = richtext("body")
      .marks(["bold", "italic", "link"])
      .nodes(["heading", "bulletList", "orderedList"])
      .blocks(["my-callout"])
      .build();
    expect(field.inputType).toBe("richtext");
    expect(field.type).toBe("json");
    expect(field.marks).toEqual(["bold", "italic", "link"]);
    expect(field.nodes).toEqual(["heading", "bulletList", "orderedList"]);
    expect(field.blocks).toEqual(["my-callout"]);
  });

  test("supports omitted allowlists (strict — denies everything except the implicit doc/paragraph/text)", () => {
    const field = richtext("body").build();
    expect(field.marks).toBeUndefined();
    expect(field.nodes).toBeUndefined();
    expect(field.blocks).toBeUndefined();
  });

  test("always injects the allowlist-walking sanitizer", () => {
    const field = richtext("body").marks(["bold"]).build();
    expect(field.sanitize).toBeTypeOf("function");
    // A doc using a disallowed mark is rejected by the injected walker.
    expect(() =>
      field.sanitize?.({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "italic" }] }],
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects non-applicable chains at the type level", () => {
    // `placeholder` is text-shaped; `options` belongs to select/radio;
    // a custom `.sanitize()` would clobber the allowlist walker.
    expectTypeOf(richtext("b")).not.toHaveProperty("placeholder");
    expectTypeOf(richtext("b")).not.toHaveProperty("options");
    expectTypeOf(richtext("b")).not.toHaveProperty("sanitize");
  });

  test("manifest round-trip preserves all three allowlist arrays on the wire", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          richtext("summary")
            .marks(["bold", "italic"])
            .nodes(["heading"])
            .blocks(["my-block"]),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "summary",
      inputType: "richtext",
      type: "json",
      marks: ["bold", "italic"],
      nodes: ["heading"],
      blocks: ["my-block"],
    });
  });
});

describe("repeater() builder", () => {
  test("pins inputType + json type and carries subFields, min, max", () => {
    const field = repeater({
      key: "links",
      label: "Links",
      min: 1,
      max: 5,
      subFields: [text("label"), text("href").label("URL")],
    });
    expect(field.inputType).toBe("repeater");
    expect(field.type).toBe("json");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.subFields).toHaveLength(2);
    expect(field.subFields[0]).toMatchObject({
      key: "label",
      inputType: "text",
    });
    expect(field.subFields[1]).toMatchObject({
      key: "href",
      inputType: "text",
    });
  });

  test("rejects subField keys that risk prototype pollution", () => {
    expect(() =>
      repeater({
        key: "rows",
        label: "Rows",
        subFields: [text("__proto__")],
      }),
    ).toThrow(/forbidden/);
    expect(() =>
      repeater({
        key: "rows",
        label: "Rows",
        subFields: [text("constructor")],
      }),
    ).toThrow(/forbidden/);
  });

  test("rejects a subField key that doesn't match the meta-key shape", () => {
    expect(() =>
      repeater({
        key: "rows",
        label: "Rows",
        subFields: [text("with space")],
      }),
    ).toThrow(/must match/);
  });

  test("rejects duplicate subField keys at registration time", () => {
    expect(() =>
      repeater({
        key: "rows",
        label: "Rows",
        subFields: [text("label"), text("label").label("Other")],
      }),
    ).toThrow(/declares subField "label" more than once/);
  });

  test("rejects a nested repeater at registration time", () => {
    expect(() =>
      repeater({
        key: "outer",
        label: "Outer",
        subFields: [
          repeater({
            key: "inner",
            label: "Inner",
            subFields: [text("v").label("Value")],
          }),
        ],
      }),
    ).toThrow(/nested repeater/i);
  });

  test("manifest round-trip recurses subFields with sanitize stripped + span dropped", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          repeater({
            key: "links",
            label: "Links",
            subFields: [text("label").maxLength(80), text("href").label("URL")],
          }),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    const entry = manifest.settingsGroups[0]?.fields[0];
    expect(entry).toMatchObject({
      key: "links",
      inputType: "repeater",
      type: "json",
    });
    expect(entry?.subFields).toHaveLength(2);
    expect(entry?.subFields?.[0]).toMatchObject({
      key: "label",
      inputType: "text",
      maxLength: 80,
    });
    // Sanitize callbacks (and any function values) are not on the wire.
    for (const sf of entry?.subFields ?? []) {
      for (const v of Object.values(sf)) {
        expect(typeof v).not.toBe("function");
      }
    }
  });
});
