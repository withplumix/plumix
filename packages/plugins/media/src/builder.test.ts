import { describe, expect, test } from "vitest";

import {
  buildManifest,
  definePlugin,
  HookRegistry,
  installPlugins,
} from "@plumix/core";

import type { MediaFieldOptions, MediaValue } from "./fields.js";
import type { MediaFieldScope } from "./index.js";
import { media } from "./fields.js";
import { media as mediaPlugin } from "./index.js";

// Public type exports get a type-level smoke test so the package
// surface stays consumable by external plugin authors. The body
// values are intentionally small — TypeScript checks the assignment
// shape at compile time, which is what we care about here.
const _typeSurface: {
  readonly opts: MediaFieldOptions;
  readonly value: MediaValue;
  readonly scope: MediaFieldScope;
} = {
  opts: {
    key: "hero",
    label: "Hero",
    accept: ["image/png"],
  },
  value: { id: "42", mime: "image/png", filename: "cat.png" },
  scope: { accept: "image/" },
};
void _typeSurface;

describe("media() builder", () => {
  test("pins inputType + json type and emits a media-kind referenceTarget with valueShape='object'", () => {
    const field = media({
      key: "hero",
      label: "Hero",
      accept: "image/",
    });
    expect(field.inputType).toBe("media");
    expect(field.type).toBe("json");
    expect(field.referenceTarget).toEqual({
      kind: "media",
      scope: { accept: "image/" },
      valueShape: "object",
    });
  });

  test("supports an exact MIME whitelist via array accept", () => {
    const field = media({
      key: "doc",
      label: "Doc",
      accept: ["image/png", "application/pdf"],
    });
    expect(field.referenceTarget.scope).toEqual({
      accept: ["image/png", "application/pdf"],
    });
  });

  test("omits accept entirely when no filter is configured", () => {
    const field = media({ key: "hero", label: "Hero" });
    // Scope object exists but with `accept: undefined` — JSON.stringify
    // drops the key, so this is identical on the wire to no scope at
    // all. The adapter's `buildAcceptMatcher` returns null on
    // undefined.
    expect(field.referenceTarget).toEqual({
      kind: "media",
      scope: { accept: undefined },
      valueShape: "object",
    });
  });

  test("rejects non-applicable options at the type level", () => {
    media({
      key: "h",
      label: "h",
      // @ts-expect-error — placeholder doesn't apply to a reference field.
      placeholder: "pick",
    });

    media({
      key: "h",
      label: "h",
      // @ts-expect-error — options belongs to select/radio.
      options: [{ value: "a", label: "A" }],
    });
  });

  test("manifest round-trip preserves cached-object referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const userPlugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("branding", {
        label: "Branding",
        fields: [
          media({
            key: "hero",
            label: "Hero image",
            accept: "image/",
          }),
        ],
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [mediaPlugin(), userPlugin],
    });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "hero",
      inputType: "media",
      type: "json",
      referenceTarget: {
        kind: "media",
        scope: { accept: "image/" },
        valueShape: "object",
      },
    });
  });
});
