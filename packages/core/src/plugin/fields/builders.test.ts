import { describe, expect, test } from "vitest";

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
  password,
  radio,
  range,
  richtext,
  select,
  term,
  termList,
  textarea,
  time,
  url,
  user,
  userList,
} from "./index.js";

// One combined suite for the seven straightforward variants whose
// shape mirrors `text()`. The dedicated `text.test.ts` covers the full
// matrix (option carry-over, sanitize identity, type-level rejection,
// manifest round-trip); these tests focus on the per-variant
// guarantees that diverge from `text` (notably `type` for `number` /
// `checkbox` and required `options` for `select` / `radio`).

describe("textarea() builder", () => {
  test("pins inputType + type, carries options", () => {
    const field = textarea({
      key: "bio",
      label: "Bio",
      placeholder: "Tell us about yourself",
      maxLength: 500,
      required: true,
    });
    expect(field.inputType).toBe("textarea");
    expect(field.type).toBe("string");
    expect(field.placeholder).toBe("Tell us about yourself");
    expect(field.maxLength).toBe(500);
    expect(field.required).toBe(true);
  });

  test("rejects non-text-shaped options at the type level", () => {
    textarea({
      key: "bio",
      label: "Bio",
      // @ts-expect-error — `min` belongs to `number` fields.
      min: 5,
    });
  });
});

describe("number() builder", () => {
  test("pins inputType + type, carries min/max/step", () => {
    const field = number({
      key: "rating",
      label: "Rating",
      min: 1,
      max: 5,
      step: 0.5,
      default: 3,
    });
    expect(field.inputType).toBe("number");
    expect(field.type).toBe("number");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.step).toBe(0.5);
    expect(field.default).toBe(3);
  });

  test("rejects text-shaped options at the type level", () => {
    number({
      key: "n",
      label: "n",
      // @ts-expect-error — `maxLength` belongs to text-shaped fields.
      maxLength: 5,
    });

    number({
      key: "n",
      label: "n",
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });
});

describe("email() builder", () => {
  test("pins inputType + type and carries text-shaped options", () => {
    const field = email({
      key: "contact",
      label: "Contact email",
      placeholder: "you@example.com",
      maxLength: 254,
    });
    expect(field.inputType).toBe("email");
    expect(field.type).toBe("string");
    expect(field.placeholder).toBe("you@example.com");
    expect(field.maxLength).toBe(254);
  });

  test("rejects number-shaped options at the type level", () => {
    email({
      key: "e",
      label: "e",
      // @ts-expect-error — `min` belongs to `number` fields.
      min: 1,
    });
  });
});

describe("url() builder", () => {
  test("pins inputType + type and carries text-shaped options", () => {
    const field = url({ key: "website", label: "Website" });
    expect(field.inputType).toBe("url");
    expect(field.type).toBe("string");
  });
});

describe("password() builder", () => {
  test("pins inputType + type and carries text-shaped options", () => {
    const field = password({
      key: "pin",
      label: "Display PIN",
      placeholder: "••••",
      maxLength: 32,
      required: true,
    });
    expect(field.inputType).toBe("password");
    expect(field.type).toBe("string");
    expect(field.placeholder).toBe("••••");
    expect(field.maxLength).toBe(32);
    expect(field.required).toBe(true);
  });

  test("rejects non-text-shaped options at the type level", () => {
    password({
      key: "p",
      label: "p",
      // @ts-expect-error — `min` is a number-bound, not a text option.
      min: 1,
    });

    password({
      key: "p",
      label: "p",
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });
});

describe("date() builder", () => {
  test("pins inputType + type and accepts ISO date bounds", () => {
    const field = date({
      key: "publishedOn",
      label: "Publish date",
      min: "2024-01-01",
      max: "2030-12-31",
      default: "2026-05-03",
    });
    expect(field.inputType).toBe("date");
    expect(field.type).toBe("string");
    expect(field.min).toBe("2024-01-01");
    expect(field.max).toBe("2030-12-31");
    expect(field.default).toBe("2026-05-03");
  });

  test("rejects numeric bounds at the type level", () => {
    date({
      key: "d",
      label: "d",
      // @ts-expect-error — date bounds are ISO strings, not numbers.
      min: 0,
    });

    date({
      key: "d",
      label: "d",
      // @ts-expect-error — `step` doesn't apply to date.
      step: 1,
    });
  });
});

describe("datetime() builder", () => {
  test("pins inputType + type and carries ISO bounds", () => {
    const field = datetime({
      key: "startsAt",
      label: "Starts at",
      min: "2026-01-01T00:00",
    });
    expect(field.inputType).toBe("datetime");
    expect(field.type).toBe("string");
    expect(field.min).toBe("2026-01-01T00:00");
  });

  test("rejects placeholder / maxLength at the type level", () => {
    datetime({
      key: "d",
      label: "d",
      // @ts-expect-error — text-shaped option, not datetime.
      placeholder: "soon",
    });
  });
});

describe("time() builder", () => {
  test("pins inputType + type and carries HH:MM bounds", () => {
    const field = time({
      key: "opensAt",
      label: "Opens at",
      min: "06:00",
      max: "23:00",
    });
    expect(field.inputType).toBe("time");
    expect(field.type).toBe("string");
    expect(field.min).toBe("06:00");
    expect(field.max).toBe("23:00");
  });

  test("rejects numeric bounds at the type level", () => {
    time({
      key: "t",
      label: "t",
      // @ts-expect-error — `min` for `time` is a string.
      min: 0,
    });
  });
});

describe("color() builder", () => {
  test("pins inputType + type and ships a default hex sanitizer", () => {
    const field = color({ key: "brand", label: "Brand color" });
    expect(field.inputType).toBe("color");
    expect(field.type).toBe("string");
    expect(field.sanitize).toBeTypeOf("function");
  });

  test("default sanitizer accepts hex shorthand and full form, lowercases", () => {
    const field = color({ key: "brand", label: "Brand color" });
    expect(field.sanitize?.("#FFA500")).toBe("#ffa500");
    expect(field.sanitize?.("#abc")).toBe("#abc");
  });

  test("default sanitizer rejects non-hex values", () => {
    const field = color({ key: "brand", label: "Brand color" });
    expect(() => field.sanitize?.("not-a-color")).toThrow();
    expect(() => field.sanitize?.("#xyz123")).toThrow();
    expect(() => field.sanitize?.(123)).toThrow();
    expect(() => field.sanitize?.(null)).toThrow();
  });

  test("custom sanitize replaces the default", () => {
    const custom = (v: unknown): unknown => `wrapped:${String(v)}`;
    const field = color({
      key: "brand",
      label: "Brand color",
      sanitize: custom,
    });
    expect(field.sanitize).toBe(custom);
  });

  test("rejects non-applicable options at the type level", () => {
    color({
      key: "c",
      label: "c",
      // @ts-expect-error — `min` doesn't apply to color.
      min: 0,
    });
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
  test("pins inputType + json type", () => {
    const field = json({ key: "config", label: "Config" });
    expect(field.inputType).toBe("json");
    expect(field.type).toBe("json");
  });

  test("forwards a custom sanitize", () => {
    const sanitize = (v: unknown): unknown => v;
    const field = json({ key: "x", label: "x", sanitize });
    expect(field.sanitize).toBe(sanitize);
  });

  test("rejects non-json options at the type level", () => {
    json({
      key: "x",
      label: "x",
      // @ts-expect-error — `options` doesn't apply to json.
      options: [{ value: "a", label: "A" }],
    });
  });
});

describe("range() builder", () => {
  test("pins inputType + type and carries bounds", () => {
    const field = range({
      key: "rating",
      label: "Rating",
      min: 1,
      max: 5,
      step: 0.5,
      default: 3,
    });
    expect(field.inputType).toBe("range");
    expect(field.type).toBe("number");
    expect(field.min).toBe(1);
    expect(field.max).toBe(5);
    expect(field.step).toBe(0.5);
    expect(field.default).toBe(3);
  });

  test("rejects min > max at registration time", () => {
    expect(() => range({ key: "r", label: "r", min: 10, max: 5 })).toThrowError(
      /min .* must be <= max/,
    );
  });

  test("default sanitizer enforces bounds and rejects NaN", () => {
    const field = range({ key: "r", label: "r", min: 0, max: 100 });
    expect(field.sanitize?.(50)).toBe(50);
    expect(() => field.sanitize?.(-1)).toThrow();
    expect(() => field.sanitize?.(101)).toThrow();
    expect(() => field.sanitize?.(Number.NaN)).toThrow();
    expect(() => field.sanitize?.("50")).toThrow();
  });

  test("rejects non-applicable options at the type level", () => {
    range({
      key: "r",
      label: "r",
      min: 0,
      max: 10,
      // @ts-expect-error — `placeholder` doesn't apply to range.
      placeholder: "go",
    });
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
          textarea({ key: "bio", label: "Bio", maxLength: 500 }),
          number({ key: "age", label: "Age", min: 0, max: 120 }),
          email({ key: "contact", label: "Contact" }),
          url({ key: "website", label: "Website" }),
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
  test("pins inputType + json type and carries the allowlist arrays", () => {
    const field = richtext({
      key: "body",
      label: "Body",
      marks: ["bold", "italic", "link"],
      nodes: ["heading", "bulletList", "orderedList"],
      blocks: ["my-callout"],
    });
    expect(field.inputType).toBe("richtext");
    expect(field.type).toBe("json");
    expect(field.marks).toEqual(["bold", "italic", "link"]);
    expect(field.nodes).toEqual(["heading", "bulletList", "orderedList"]);
    expect(field.blocks).toEqual(["my-callout"]);
  });

  test("supports omitted allowlists (strict — denies everything except the implicit doc/paragraph/text)", () => {
    const field = richtext({ key: "body", label: "Body" });
    expect(field.marks).toBeUndefined();
    expect(field.nodes).toBeUndefined();
    expect(field.blocks).toBeUndefined();
  });

  test("rejects non-applicable options at the type level", () => {
    richtext({
      key: "b",
      label: "b",
      // @ts-expect-error — `placeholder` is a text-shaped option.
      placeholder: "type here",
    });

    richtext({
      key: "b",
      label: "b",
      // @ts-expect-error — `options` belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves all three allowlist arrays on the wire", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          richtext({
            key: "summary",
            label: "Summary",
            marks: ["bold", "italic"],
            nodes: ["heading"],
            blocks: ["my-block"],
          }),
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
