import type { ImageRoles } from "plumix";
import { FieldConfigError } from "plumix/fields";
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

declare module "plumix" {
  interface ImageRoles {
    hero: true;
  }
}
expectTypeOf<keyof ImageRoles>().toEqualTypeOf<
  "featured" | "ogImage" | "hero"
>();

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

  test(".featured() tags the field with the featured role", () => {
    expect(media("hero").featured().build().role).toBe("featured");
  });

  test(".ogImage() tags the field with the ogImage override role", () => {
    expect(media("share").ogImage().build().role).toBe("ogImage");
  });

  test(".role() tags the field and, with no accept declared, limits it to images", () => {
    const field = media("cover").role("hero").build();
    expect(field.role).toBe("hero");
    expect(field.referenceTarget).toEqual({
      kind: "media",
      scope: { accept: "image/" },
    });
  });

  test(".featured() and .ogImage() limit the field to images the same way", () => {
    expect(media("hero").featured().build().referenceTarget.scope).toEqual({
      accept: "image/",
    });
    expect(media("share").ogImage().build().referenceTarget.scope).toEqual({
      accept: "image/",
    });
  });

  test.each([{ accept: [] }, { accept: "" }])(
    "reads an empty accept ($accept) as none, so a role still limits it to images",
    ({ accept }) => {
      expect(
        media("cover").accept(accept).role("hero").build().referenceTarget
          .scope,
      ).toEqual({ accept: "image/" });
    },
  );

  test("keeps a role field's own image accept", () => {
    expect(
      media("cover").accept(["image/png", "image/webp"]).role("hero").build()
        .referenceTarget.scope,
    ).toEqual({ accept: ["image/png", "image/webp"] });
  });

  test.each([
    {
      order: "accept before role",
      build: () => media("brochure").accept("application/pdf").role("hero"),
    },
    {
      order: "role before accept",
      build: () => media("brochure").role("hero").accept("application/pdf"),
    },
    {
      order: "a list naming a prefix, which a list matches exactly",
      build: () => media("brochure").accept(["image/"]).role("hero"),
    },
    {
      order: "a list admitting a non-image",
      build: () =>
        media("brochure").accept(["image/png", "video/mp4"]).featured(),
    },
  ])(
    "rejects a role field whose accept admits non-images ($order)",
    ({ build }) => {
      expect(build).toThrow(FieldConfigError);
      expect(build).toThrow(/image role/);
    },
  );

  test.each([
    { case: "a prefix over 64 characters", accept: "a".repeat(65) },
    {
      case: "a list of 33 types",
      accept: Array.from({ length: 33 }, (_, i) => `image/x-${String(i)}`),
    },
    { case: "a listed type over 64 characters", accept: ["a".repeat(65)] },
  ])("rejects an accept media.list would refuse ($case)", ({ accept }) => {
    const build = () => media("file").accept(accept);
    expect(build).toThrow(FieldConfigError);
    expect(build).toThrow(/accept/);
  });

  test("keeps an accept at the list limits", () => {
    const accept = Array.from({ length: 32 }, () => "a".repeat(64));
    expect(media("file").accept(accept).build().referenceTarget.scope).toEqual({
      accept,
    });
    expect(
      media("file").accept("a".repeat(64)).build().referenceTarget.scope,
    ).toEqual({ accept: "a".repeat(64) });
  });

  test(".role() only takes a declared role name", () => {
    // @ts-expect-error — "typo" is not a key of ImageRoles
    media("cover").role("typo");
  });

  test("role markers reject multi-value fields at the type level", () => {
    // @ts-expect-error — featured is single-only; .multiple() drops it
    media("gallery").multiple().featured();
    // @ts-expect-error — ogImage is single-only; .multiple() drops it
    media("gallery").multiple().ogImage();
    // @ts-expect-error — any role is single-only
    media("gallery").multiple().role("hero");
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
