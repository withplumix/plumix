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
  number,
  password,
  radio,
  range,
  select,
  textarea,
  time,
  url,
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
    expect(() =>
      range({ key: "r", label: "r", min: 10, max: 5 }),
    ).toThrowError(/min .* must be <= max/);
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
