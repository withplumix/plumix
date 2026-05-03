import { describe, expect, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import {
  checkbox,
  email,
  number,
  password,
  radio,
  select,
  textarea,
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
      // @ts-expect-error — `min` belongs to `number` fields.
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
