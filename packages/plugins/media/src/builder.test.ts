import {
  buildManifest,
  definePlugin,
  HookRegistry,
  installPlugins,
} from "plumix/plugin";
import { describe, expect, expectTypeOf, test } from "vitest";

import type { MediaFieldScope, MediaReference } from "./index.js";
import { media } from "./fields.js";
import { media as mediaPlugin } from "./index.js";

// Public type export gets a type-level smoke test so the package
// surface stays consumable by external plugin authors.
const _scope: MediaFieldScope = { accept: "image/" };
void _scope;

describe("media() builder", () => {
  test("derives the label, pins inputType + json type, emits a media referenceTarget", () => {
    const field = media("heroImage").accept("image/").build();
    expect(field.inputType).toBe("media");
    expect(field.type).toBe("json");
    expect(field.label).toBe("Hero image");
    expect(field.referenceTarget).toEqual({
      kind: "media",
      scope: { accept: "image/" },
    });
  });

  test("supports an exact MIME whitelist via array accept", () => {
    const field = media("doc")
      .label("Doc")
      .accept(["image/png", "application/pdf"])
      .build();
    expect(field.referenceTarget.scope).toEqual({
      accept: ["image/png", "application/pdf"],
    });
  });

  test("omits accept entirely when no filter is configured", () => {
    const field = media("hero").build();
    expect(field.referenceTarget).toEqual({ kind: "media", scope: {} });
  });

  test(".multiple() flips to a multi media target with an optional max", () => {
    const field = media("gallery").accept("image/").multiple().max(6).build();
    expect(field.inputType).toBe("mediaList");
    expect(field.type).toBe("json");
    expect(field.max).toBe(6);
    expect(field.referenceTarget).toEqual({
      kind: "media",
      scope: { accept: "image/" },
      multiple: true,
    });
  });

  test("rejects non-applicable chains at the type level", () => {
    expectTypeOf(media("h")).not.toHaveProperty("placeholder");
    expectTypeOf(media("h")).not.toHaveProperty("options");
  });

  test("phantom typing: hydrated MediaReference by default, id after .returns('id')", () => {
    const _single = media("hero");
    expectTypeOf<(typeof _single)["_key"]>().toEqualTypeOf<"hero">();
    expectTypeOf<(typeof _single)["_value"]>().toEqualTypeOf<
      MediaReference | undefined
    >();
    // A single reference orphans, so the read stays optional under .required().
    const _required = media("hero").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<
      MediaReference | undefined
    >();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<string>();

    const _id = media("hero").returns("id");
    expectTypeOf<(typeof _id)["_value"]>().toEqualTypeOf<string | undefined>();

    const _multi = media("gallery").multiple();
    expectTypeOf<(typeof _multi)["_value"]>().toEqualTypeOf<
      readonly MediaReference[] | undefined
    >();
    const _requiredMulti = media("gallery").multiple().required();
    expectTypeOf<(typeof _requiredMulti)["_value"]>().toEqualTypeOf<
      readonly MediaReference[]
    >();
  });

  test("manifest round-trip preserves the referenceTarget on the wire shape", async () => {
    const hooks = new HookRegistry();
    const userPlugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("branding", {
        label: "Branding",
        fields: [media("hero").label("Hero image").accept("image/")],
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
      },
    });
  });

  test("manifest round-trip preserves multi referenceTarget + max on the wire shape", async () => {
    const hooks = new HookRegistry();
    const userPlugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("branding", {
        label: "Branding",
        fields: [
          media("carousel")
            .label("Hero carousel")
            .accept("image/")
            .multiple()
            .max(8),
        ],
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [mediaPlugin(), userPlugin],
    });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fields[0]).toMatchObject({
      key: "carousel",
      inputType: "mediaList",
      type: "json",
      max: 8,
      referenceTarget: {
        kind: "media",
        scope: { accept: "image/" },
        multiple: true,
      },
    });
  });
});
