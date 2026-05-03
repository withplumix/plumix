import { describe, expect, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import { text } from "./text.js";

describe("text() field builder", () => {
  test("pins inputType + type and carries supplied options", () => {
    const field = text({
      key: "site_title",
      label: "Site title",
      placeholder: "My site",
      maxLength: 60,
      required: true,
      description: "Shown in the browser tab.",
      default: "My Site",
    });

    expect(field).toEqual({
      key: "site_title",
      label: "Site title",
      type: "string",
      inputType: "text",
      placeholder: "My site",
      maxLength: 60,
      required: true,
      description: "Shown in the browser tab.",
      default: "My Site",
      span: undefined,
      sanitize: undefined,
    });
  });

  test("leaves omitted options undefined rather than coercing to defaults", () => {
    const field = text({ key: "title", label: "Title" });

    expect(field.placeholder).toBeUndefined();
    expect(field.maxLength).toBeUndefined();
    expect(field.required).toBeUndefined();
    expect(field.default).toBeUndefined();
    expect(field.span).toBeUndefined();
  });

  test("forwards a sanitize callback so registration sees the same function", () => {
    const sanitize = (value: unknown): string =>
      typeof value === "string" ? value.trim() : "";
    const field = text({ key: "title", label: "Title", sanitize });
    expect(field.sanitize).toBe(sanitize);
  });

  test("rejects non-text-shaped options at the type level", () => {
    text({
      key: "title",
      label: "Title",
      // @ts-expect-error — `min` is a `number` field option, not text.
      min: 5,
    });

    text({
      key: "title",
      label: "Title",
      // @ts-expect-error — `options` belongs to `select` / `radio`.
      options: [{ value: "a", label: "A" }],
    });

    text({
      key: "title",
      label: "Title",
      // @ts-expect-error — `step` is a `number` field option.
      step: 1,
    });
  });

  test("survives manifest serialization with the right wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [
          text({
            key: "site_title",
            label: "Site title",
            maxLength: 60,
            default: "My Site",
          }),
        ],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    expect(manifest.settingsGroups[0]).toMatchObject({
      name: "identity",
      fields: [
        {
          key: "site_title",
          label: "Site title",
          type: "string",
          inputType: "text",
          maxLength: 60,
          default: "My Site",
        },
      ],
    });
  });
});
