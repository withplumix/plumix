import { describe, expect, expectTypeOf, test } from "vitest";

import type {
  EntryReferenceSummary,
  TermReferenceSummary,
  UserReferenceSummary,
} from "../lookup.js";
import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import {
  color,
  date,
  datetime,
  email,
  entry,
  group,
  json,
  number,
  range,
  repeater,
  richtext,
  select,
  term,
  text,
  textarea,
  time,
  toggle,
  url,
  user,
} from "./index.js";

// One combined suite for the per-variant builder guarantees. The
// universal-chain + immutability behavior shared by every fluent
// builder is covered by `builder.test.ts` (string scalars as the
// reference), and the choice builders in `select.test.ts` /
// `toggle.test.ts`; these tests focus on what each variant adds —
// per-type option chains, injected sanitizers, `.returns("date")`,
// and the reference builders' scope / cardinality / hydration typing.

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

  test("rejects malformed bounds at registration time", () => {
    // A typo'd bound would otherwise silently reject every value —
    // ISO shapes compare lexicographically, so "March 1" beats any
    // "2026-…" string. Newly load-bearing now that the walker
    // enforces bounds server-side.
    expect(() => date("d").min("March 1").build()).toThrowError(
      /temporal bound/,
    );
    expect(() => date("d").max("2026-13-45").build()).toThrowError(
      /temporal bound/,
    );
    expect(() => time("t").min("25:99").build()).toThrowError(/temporal bound/);
    expect(() => date("d").min("2026-01-01").build()).not.toThrow();
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
  test("compiles with a derived label and no injected sanitizer", () => {
    // Hex enforcement + lowercasing live in the constraint walker
    // (field-pipeline suite), not in a builder-injected sanitize.
    const field = color("brandColor").build();
    expect(field.inputType).toBe("color");
    expect(field.type).toBe("string");
    expect(field.label).toBe("Brand color");
    expect(field.sanitize).toBeUndefined();
  });

  test("a custom .sanitize() is carried as-is", () => {
    const custom = (v: string): string => v;
    const field = color("brand").sanitize(custom).build();
    expect(field.sanitize).toBe(custom);
  });

  test("rejects non-applicable chains at the type level", () => {
    // `min` doesn't apply to color.
    expectTypeOf(color("c")).not.toHaveProperty("min");
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

  test("carries bounds on the definition with no injected sanitizer", () => {
    // Bounds are enforced by the constraint walker (field-pipeline
    // suite); the definition just declares them.
    const field = range("r").min(0).max(100).build();
    expect(field.min).toBe(0);
    expect(field.max).toBe(100);
    expect(field.sanitize).toBeUndefined();
  });

  test("a custom .sanitize() is carried as-is", () => {
    const custom = (v: number): number => v;
    const field = range("r").min(0).max(10).sanitize(custom).build();
    expect(field.sanitize).toBe(custom);
  });

  test("rejects non-applicable chains at the type level", () => {
    // `placeholder` doesn't apply to range.
    expectTypeOf(range("r")).not.toHaveProperty("placeholder");
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
          select("size")
            .options([{ value: "m", label: "M" }])
            .label("Size"),
          select("yn").options(["y", "n"]).appearance("radio").label("Yes/No"),
          toggle("agreed").label("Agreed").default(false),
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
      "select",
      "toggle",
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
    const field = user("owner")
      .label("Owner")
      .roles(["editor", "admin"])
      .build();
    expect(field.inputType).toBe("user");
    expect(field.type).toBe("string");
    expect(field.label).toBe("Owner");
    expect(field.referenceTarget).toEqual({
      kind: "user",
      scope: { roles: ["editor", "admin"] },
    });
  });

  test("derives the label from the key and chains includeDisabled into scope", () => {
    const field = user("siteOwner").includeDisabled().build();
    expect(field.label).toBe("Site owner");
    expect(field.referenceTarget.scope).toEqual({ includeDisabled: true });
  });

  test(".multiple() flips to a json array target with an optional max", () => {
    const field = user("owners").roles(["admin"]).multiple().max(5).build();
    expect(field.inputType).toBe("userList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(5);
    expect(field.referenceTarget).toEqual({
      kind: "user",
      scope: { roles: ["admin"] },
      multiple: true,
    });
  });

  test("rejects non-applicable chains at the type level", () => {
    // `placeholder` is text-shaped; `options` belongs to select/radio.
    // (`.max()` / `.contains()` exist but are `this`-gated to multi.)
    expectTypeOf(user("u")).not.toHaveProperty("placeholder");
    expectTypeOf(user("u")).not.toHaveProperty("options");
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [user("owner").label("Owner").roles(["admin"])],
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
  test("takes the entry-type scope in the constructor and emits an entry-kind referenceTarget", () => {
    const field = entry("related", ["post"]).label("Related post").build();
    expect(field.inputType).toBe("entry");
    expect(field.type).toBe("string");
    expect(field.referenceTarget).toEqual({
      kind: "entry",
      scope: { entryTypes: ["post"] },
    });
  });

  test("chains includeTrashed / status into the scope", () => {
    const field = entry("related", ["post"])
      .includeTrashed()
      .status("published")
      .build();
    expect(field.referenceTarget.scope).toEqual({
      entryTypes: ["post"],
      includeTrashed: true,
      status: "published",
    });
  });

  test(".multiple() flips to a json array target with an optional max", () => {
    const field = entry("related", ["post"]).multiple().max(4).build();
    expect(field.inputType).toBe("entryList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(4);
    expect(field.referenceTarget).toEqual({
      kind: "entry",
      scope: { entryTypes: ["post"] },
      multiple: true,
    });
  });

  test("rejects non-applicable chains at the type level", () => {
    expectTypeOf(entry("e", ["post"])).not.toHaveProperty("placeholder");
    expectTypeOf(entry("e", ["post"])).not.toHaveProperty("options");
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [entry("homepage", ["page"]).label("Homepage")],
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
  test("takes the taxonomy scope in the constructor and emits a term-kind referenceTarget", () => {
    const field = term("primary", ["category"])
      .label("Primary category")
      .build();
    expect(field.inputType).toBe("term");
    expect(field.type).toBe("string");
    expect(field.referenceTarget).toEqual({
      kind: "term",
      scope: { termTaxonomies: ["category"] },
    });
  });

  test(".multiple() flips to a json array target with an optional max", () => {
    const field = term("tags", ["tag", "category"]).multiple().build();
    expect(field.inputType).toBe("termList");
    expect(field.type).toBe("json");
    expect(field.max).toBeUndefined();
    expect(field.referenceTarget).toEqual({
      kind: "term",
      scope: { termTaxonomies: ["tag", "category"] },
      multiple: true,
    });
  });

  test("rejects non-applicable chains at the type level", () => {
    expectTypeOf(term("t", ["category"])).not.toHaveProperty("placeholder");
    expectTypeOf(term("t", ["category"])).not.toHaveProperty("options");
  });

  test("manifest round-trip preserves referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("classification", {
        label: "Classification",
        fields: [term("section", ["category"]).label("Section")],
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

describe("reference builder phantom typing", () => {
  test("keys are the literal key argument", () => {
    const _u = user("owner");
    expectTypeOf<(typeof _u)["_key"]>().toEqualTypeOf<"owner">();
    const _e = entry("related", ["post"]);
    expectTypeOf<(typeof _e)["_key"]>().toEqualTypeOf<"related">();
    const _t = term("primary", ["category"]);
    expectTypeOf<(typeof _t)["_key"]>().toEqualTypeOf<"primary">();
  });

  test("single reads default to the hydrated summary and stay optional even under .required()", () => {
    const _u = user("owner");
    expectTypeOf<(typeof _u)["_value"]>().toEqualTypeOf<
      UserReferenceSummary | undefined
    >();
    // A single reference orphans, so the read stays `| undefined`.
    const _required = user("owner").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<
      UserReferenceSummary | undefined
    >();
    // But `.required()` narrows the stored (whereMeta) shape.
    expectTypeOf<(typeof _u)["_stored"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<string>();

    const _e = entry("related", ["post"]);
    expectTypeOf<(typeof _e)["_value"]>().toEqualTypeOf<
      EntryReferenceSummary | undefined
    >();
    const _t = term("primary", ["category"]);
    expectTypeOf<(typeof _t)["_value"]>().toEqualTypeOf<
      TermReferenceSummary | undefined
    >();
  });

  test('.returns("id") swaps the hydrated read for the bare id, storage unchanged', () => {
    const _id = entry("related", ["post"]).returns("id");
    expectTypeOf<(typeof _id)["_value"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<(typeof _id)["_stored"]>().toEqualTypeOf<string | undefined>();
  });

  test(".multiple() reads a dense hydrated array; .required() drops the array's optionality", () => {
    const _multi = entry("related", ["post"]).multiple();
    expectTypeOf<(typeof _multi)["_value"]>().toEqualTypeOf<
      readonly EntryReferenceSummary[] | undefined
    >();
    expectTypeOf<(typeof _multi)["_stored"]>().toEqualTypeOf<
      readonly string[] | undefined
    >();

    const _requiredMulti = entry("related", ["post"]).multiple().required();
    expectTypeOf<(typeof _requiredMulti)["_value"]>().toEqualTypeOf<
      readonly EntryReferenceSummary[]
    >();
    expectTypeOf<(typeof _requiredMulti)["_stored"]>().toEqualTypeOf<
      readonly string[]
    >();

    const _idMulti = entry("related", ["post"]).multiple().returns("id");
    expectTypeOf<(typeof _idMulti)["_value"]>().toEqualTypeOf<
      readonly string[] | undefined
    >();
  });

  test("order-independent: .required() before or after .multiple() lands the same", () => {
    const _a = user("owners").multiple().required();
    const _b = user("owners").multiple().max(3);
    expectTypeOf<(typeof _a)["_value"]>().toEqualTypeOf<
      readonly UserReferenceSummary[]
    >();
    expectTypeOf<(typeof _b)["_value"]>().toEqualTypeOf<
      readonly UserReferenceSummary[] | undefined
    >();
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

  test("carries the allowlists with no injected sanitizer", () => {
    // Allowlist enforcement moved to the constraint walker
    // (field-pipeline suite) — the definition just declares them.
    const field = richtext("body").marks(["bold"]).build();
    expect(field.marks).toEqual(["bold"]);
    expect(field.sanitize).toBeUndefined();
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
  test("pins inputType + json type and carries subFields, min, max, UX affordances", () => {
    const field = repeater("links")
      .fields([text("label"), text("href").label("URL")])
      .label("Links")
      .min(1)
      .max(5)
      .addLabel("Add link")
      .layout("table")
      .collapsed("label")
      .build();
    expect(field.inputType).toBe("repeater");
    expect(field.type).toBe("json");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.addLabel).toBe("Add link");
    expect(field.layout).toBe("table");
    expect(field.collapsed).toBe("label");
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

  test("derives a humanized label when none is set", () => {
    const field = repeater("callToActions")
      .fields([text("label")])
      .build();
    expect(field.label).toBe("Call to actions");
  });

  test("chains are immutable — a shared base forks without aliasing", () => {
    const base = repeater("rows").fields([text("v")]);
    const required = base.required();
    expect(base.build().required).toBeUndefined();
    expect(required.build().required).toBe(true);
  });

  test("rejects subField keys that risk prototype pollution", () => {
    expect(() => repeater("rows").fields([text("__proto__")])).toThrow(
      /forbidden/,
    );
    expect(() => repeater("rows").fields([text("constructor")])).toThrow(
      /forbidden/,
    );
  });

  test("rejects a subField key that doesn't match the meta-key shape", () => {
    expect(() => repeater("rows").fields([text("with space")])).toThrow(
      /must match/,
    );
  });

  test("rejects duplicate subField keys at registration time", () => {
    expect(() =>
      repeater("rows").fields([text("label"), text("label").label("Other")]),
    ).toThrow(/declares field "label" more than once/);
  });

  test("permits a nested repeater — the v0.1 nesting ban is lifted", () => {
    const field = repeater("outer")
      .fields([
        text("title"),
        repeater("inner").fields([text("v").label("Value")]),
      ])
      .build();
    const inner = field.subFields[1];
    expect(inner).toMatchObject({ key: "inner", inputType: "repeater" });
  });

  test("value type recurses through arbitrarily nested rows", () => {
    const _sections = repeater("sections").fields([
      text("heading").required(),
      repeater("callouts").fields([select("tone").options(["a", "b"])]),
    ]);
    type Value = NonNullable<(typeof _sections)["_value"]>;
    expectTypeOf<Value[number]["heading"]>().toEqualTypeOf<string>();
    type Callouts = NonNullable<Value[number]["callouts"]>;
    expectTypeOf<Callouts[number]["tone"]>().toEqualTypeOf<
      "a" | "b" | undefined
    >();
  });

  test("unadorned reads optional array; .required() narrows", () => {
    const optional = repeater("rows").fields([text("v")]);
    expectTypeOf(optional._value).toEqualTypeOf<
      readonly { v: string | undefined }[] | undefined
    >();
    const required = optional.required();
    expectTypeOf(required._value).toEqualTypeOf<
      readonly { v: string | undefined }[]
    >();
  });

  test("manifest round-trip recurses subFields with sanitize stripped + span dropped", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          repeater("links")
            .fields([text("label").maxLength(80), text("href").label("URL")])
            .label("Links")
            .addLabel("Add link"),
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
      addLabel: "Add link",
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

describe("group() builder", () => {
  test("pins inputType + json type and carries member fields", () => {
    const field = group("seo")
      .fields([text("title").maxLength(60), textarea("description")])
      .label("SEO")
      .build();
    expect(field.inputType).toBe("group");
    expect(field.type).toBe("json");
    expect(field.fields).toHaveLength(2);
    expect(field.fields[0]).toMatchObject({ key: "title", inputType: "text" });
  });

  test("reads as a typed nested record; .required() narrows away undefined", () => {
    const optional = group("seo").fields([
      text("title").required(),
      textarea("description"),
    ]);
    expectTypeOf(optional._value).toEqualTypeOf<
      { title: string; description: string | undefined } | undefined
    >();
    const required = optional.required();
    expectTypeOf(required._value).toEqualTypeOf<{
      title: string;
      description: string | undefined;
    }>();
  });

  test("nests repeaters and further groups; types recurse", () => {
    const _field = group("layout").fields([
      group("hero").fields([text("headline")]),
      repeater("cards").fields([text("label")]),
    ]);
    type Value = NonNullable<(typeof _field)["_value"]>;
    expectTypeOf<NonNullable<Value["hero"]>["headline"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<NonNullable<Value["cards"]>[number]["label"]>().toEqualTypeOf<
      string | undefined
    >();
  });

  test("rejects duplicate member keys and prototype-pollution keys", () => {
    expect(() => group("seo").fields([text("title"), text("title")])).toThrow(
      /declares field "title" more than once/,
    );
    expect(() => group("seo").fields([text("__proto__")])).toThrow(/forbidden/);
  });

  test("manifest round-trip projects members into the wire subFields slot", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          group("seo")
            .fields([text("title").maxLength(60), textarea("description")])
            .label("SEO"),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);
    const entry = manifest.settingsGroups[0]?.fields[0];
    expect(entry).toMatchObject({
      key: "seo",
      inputType: "group",
      type: "json",
    });
    expect(entry?.subFields).toHaveLength(2);
    expect(entry?.subFields?.[0]).toMatchObject({
      key: "title",
      inputType: "text",
      maxLength: 60,
    });
  });
});
