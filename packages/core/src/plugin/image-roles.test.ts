import { describe, expect, test } from "vitest";

import type { ImageRoleScope } from "./image-roles.js";
import type { MetaBoxField } from "./manifest.js";
import type { PluginSetupContext } from "./setup-context.js";
import { HookRegistry } from "../hooks/registry.js";
import { buildManifest } from "./build-manifest.js";
import { definePlugin } from "./define.js";
import { imageRoleFields } from "./image-roles.js";
import { installPlugins } from "./register.js";

declare module "./image-roles.js" {
  interface ImageRoles {
    hero: true;
  }
}

function mediaField(key: string, role?: MetaBoxField["role"]): MetaBoxField {
  return {
    key,
    label: key,
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media", scope: { accept: "image/" } },
    ...(role === undefined ? {} : { role }),
  };
}

function groupField(
  key: string,
  fields: readonly MetaBoxField[],
): MetaBoxField {
  return { key, label: key, type: "json", inputType: "group", fields };
}

function repeaterField(
  key: string,
  subFields: readonly MetaBoxField[],
): MetaBoxField {
  return { key, label: key, type: "json", inputType: "repeater", subFields };
}

async function registryFrom(setup: (ctx: PluginSetupContext) => void) {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [definePlugin("site", setup)],
  });
  return registry;
}

describe("imageRoleFields", () => {
  test("resolves a featured field nested in groups, with the path to its value", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryMetaBox("appearance", {
        label: "Appearance",
        entryTypes: ["post"],
        fields: [
          groupField("layout", [
            groupField("header", [mediaField("cover", "featured")]),
          ]),
        ],
      });
    });

    const fields = imageRoleFields(
      registry,
      { kind: "entry", entryType: "post" },
      "featured",
    );

    expect(fields.map(({ path }) => path)).toEqual([
      ["layout", "header", "cover"],
    ]);
    expect(fields[0]?.field.key).toBe("cover");
  });

  test("resolves a plugin-registered role on entries, terms and users", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerImageRole("hero", { single: true });
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerTermTaxonomy("category", { label: "Categories" });
      ctx.registerEntryMetaBox("post-art", {
        label: "Art",
        entryTypes: ["post"],
        fields: [mediaField("splash", "hero")],
      });
      ctx.registerTermMetaBox("term-art", {
        label: "Art",
        termTaxonomies: ["category"],
        fields: [mediaField("banner", "hero")],
      });
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        fields: [groupField("page", [mediaField("backdrop", "hero")])],
      });
    });

    const paths = (scope: ImageRoleScope) =>
      imageRoleFields(registry, scope, "hero").map(({ path }) => path);

    expect(paths({ kind: "entry", entryType: "post" })).toEqual([["splash"]]);
    expect(paths({ kind: "term", taxonomy: "category" })).toEqual([["banner"]]);
    expect(paths({ kind: "user" })).toEqual([["page", "backdrop"]]);
    expect(() => buildManifest(registry)).not.toThrow();
  });
});

test("a query made while plugins are still registering does not freeze the index", async () => {
  const early = definePlugin("early", {
    setup: (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
    },
    afterSetup: (ctx) => {
      imageRoleFields(
        ctx.plugins,
        { kind: "entry", entryType: "post" },
        "featured",
      );
    },
  });
  const late = definePlugin("late", {
    setup: () => undefined,
    afterSetup: (ctx) => {
      ctx.registerEntryMetaBox("art", {
        label: "Art",
        entryTypes: ["post"],
        fields: [repeaterField("slides", [mediaField("image", "featured")])],
      });
    },
  });
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [early, late],
  });

  expect(() => buildManifest(registry)).toThrow(/inside repeater "slides"/);
});

test("a query made before a later plugin registers its role does not throw for it", async () => {
  const early = definePlugin("early", {
    setup: (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
    },
    afterSetup: (ctx) => {
      ctx.registerEntryMetaBox("art", {
        label: "Art",
        entryTypes: ["post"],
        fields: [mediaField("splash", "hero")],
      });
      imageRoleFields(
        ctx.plugins,
        { kind: "entry", entryType: "post" },
        "featured",
      );
    },
  });
  const late = definePlugin("late", {
    setup: () => undefined,
    afterSetup: (ctx) => {
      ctx.registerImageRole("hero", { single: true });
    },
  });

  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [early, late],
  });

  expect(() => buildManifest(registry)).not.toThrow();
});

test("a box listing one entry type twice does not count its field twice", async () => {
  const registry = await registryFrom((ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryMetaBox("art", {
      label: "Art",
      entryTypes: ["post", "post"],
      fields: [mediaField("hero", "featured")],
    });
  });

  expect(() => buildManifest(registry)).not.toThrow();
});

describe("image-role boot checks", () => {
  test.each([
    {
      shape: "directly in a repeater",
      fields: [repeaterField("slides", [mediaField("image", "featured")])],
      message:
        'Field "slides.image" on entry type "post" has image role "featured" inside repeater "slides".',
    },
    {
      shape: "in a group inside a repeater",
      fields: [
        repeaterField("slides", [
          groupField("media", [mediaField("image", "featured")]),
        ]),
      ],
      message:
        'Field "slides.media.image" on entry type "post" has image role "featured" inside repeater "slides".',
    },
    {
      shape: "in a repeater nested in a group",
      fields: [
        groupField("gallery", [
          repeaterField("rows", [mediaField("image", "featured")]),
        ]),
      ],
      message:
        'Field "gallery.rows.image" on entry type "post" has image role "featured" inside repeater "gallery.rows".',
    },
  ])("rejects a role field $shape", async ({ fields, message }) => {
    const registry = await registryFrom((ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryMetaBox("box", {
        label: "Box",
        entryTypes: ["post"],
        fields,
      });
    });

    expect(() => buildManifest(registry)).toThrow(message);
  });

  test.each([
    {
      scope: "an entry type",
      register: (ctx: PluginSetupContext) => {
        ctx.registerEntryType("post", { label: "Posts" });
        ctx.registerEntryMetaBox("a", {
          label: "A",
          entryTypes: ["post"],
          fields: [mediaField("hero", "featured")],
        });
        ctx.registerEntryMetaBox("b", {
          label: "B",
          entryTypes: ["post"],
          fields: [mediaField("cover", "featured")],
        });
      },
      message:
        'Image role "featured" allows one field on entry type "post", but found two: "hero" and "cover".',
    },
    {
      scope: "a term taxonomy",
      register: (ctx: PluginSetupContext) => {
        ctx.registerTermTaxonomy("category", { label: "Categories" });
        ctx.registerTermMetaBox("a", {
          label: "A",
          termTaxonomies: ["category"],
          fields: [mediaField("icon", "featured")],
        });
        ctx.registerTermMetaBox("b", {
          label: "B",
          termTaxonomies: ["category"],
          fields: [groupField("art", [mediaField("banner", "featured")])],
        });
      },
      message:
        'Image role "featured" allows one field on term taxonomy "category", but found two: "icon" and "art.banner".',
    },
    {
      scope: "users",
      register: (ctx: PluginSetupContext) => {
        ctx.registerUserMetaBox("profile", {
          label: "Profile",
          fields: [
            mediaField("avatar", "featured"),
            mediaField("cover", "featured"),
          ],
        });
      },
      message:
        'Image role "featured" allows one field on users, but found two: "avatar" and "cover".',
    },
  ])(
    "rejects a second featured field on $scope",
    async ({ register, message }) => {
      const registry = await registryFrom(register);

      expect(() => buildManifest(registry)).toThrow(message);
    },
  );

  test("allows several fields in a role that is not single", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        fields: [mediaField("share", "ogImage"), mediaField("alt", "ogImage")],
      });
    });

    expect(
      imageRoleFields(registry, { kind: "user" }, "ogImage").map(
        ({ path }) => path,
      ),
    ).toEqual([["share"], ["alt"]]);
  });

  test("rejects a role field that stores several images, naming its scope", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        fields: [
          {
            key: "gallery",
            label: "Gallery",
            type: "json",
            inputType: "mediaList",
            referenceTarget: { kind: "media", scope: {}, multiple: true },
            role: "ogImage",
          },
        ],
      });
    });

    expect(() => buildManifest(registry)).toThrow(
      'Field "gallery" on users is in image role "ogImage" but stores several values. A role field holds a single image.',
    );
  });

  test("rejects a role nobody registered, naming the field and the role", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerTermTaxonomy("category", { label: "Categories" });
      ctx.registerTermMetaBox("box", {
        label: "Box",
        termTaxonomies: ["category"],
        fields: [groupField("art", [mediaField("banner", "hero")])],
      });
    });

    expect(() => buildManifest(registry)).toThrow(
      'Field "art.banner" on term taxonomy "category" has image role "hero", which no plugin registered.',
    );
  });
});
