import { describe, expect, test } from "vitest";

import type { MetaBoxField, PluginRegistry } from "../plugin/manifest.js";
import type { TemplateData } from "../theme.js";
import { entryRoleImage } from "./entry-image.js";

// A minimal hydrated media reference (the read shape the resolver consumes).
const mediaRef = (url: string) => ({ id: "m1", url });

const mediaField = (
  key: string,
  role?: "featured" | "ogImage",
): MetaBoxField => ({
  key,
  label: key,
  type: "json",
  inputType: "media",
  referenceTarget: { kind: "media", scope: {} },
  ...(role ? { role } : {}),
});

// A registry carrying one entry meta box, scoped to the given entry types.
const registryWith = (
  entryTypes: readonly string[],
  fields: readonly MetaBoxField[],
): PluginRegistry =>
  ({
    entryMetaBoxes: new Map([["box", { entryTypes, fields }]]),
  }) as unknown as PluginRegistry;

const entryData = (type: string, meta: Record<string, unknown>): TemplateData =>
  ({ kind: "entry", entry: { type, meta } }) as unknown as TemplateData;

/** The role walk as its only caller reaches it: through one entry type's fields. */
const roleImage = (
  fields: readonly MetaBoxField[],
  meta: Record<string, unknown>,
  role: "featured" | "ogImage",
) =>
  entryRoleImage(registryWith(["post"], fields), entryData("post", meta), role);

describe("entryRoleImage — the role walk", () => {
  test("returns the tagged field's url", () => {
    const image = roleImage(
      [mediaField("hero", "featured")],
      { hero: mediaRef("https://cdn/hero.jpg") },
      "featured",
    );
    expect(image?.url).toBe("https://cdn/hero.jpg");
  });

  test("carries the media row's measured size", () => {
    const image = roleImage(
      [mediaField("hero", "featured")],
      {
        hero: { ...mediaRef("https://cdn/hero.jpg"), width: 1600, height: 900 },
      },
      "featured",
    );
    expect(image).toEqual({
      url: "https://cdn/hero.jpg",
      width: 1600,
      height: 900,
    });
  });

  test("an unmeasured media row resolves to a url alone", () => {
    const image = roleImage(
      [mediaField("hero", "featured")],
      {
        hero: {
          ...mediaRef("https://cdn/hero.jpg"),
          width: null,
          height: null,
        },
      },
      "featured",
    );
    expect(image).toEqual({ url: "https://cdn/hero.jpg" });
  });

  test("reads only the role it was asked for", () => {
    const fields = [
      mediaField("hero", "featured"),
      mediaField("share", "ogImage"),
    ];
    const meta = {
      hero: mediaRef("https://cdn/hero.jpg"),
      share: mediaRef("https://cdn/share.jpg"),
    };
    expect(roleImage(fields, meta, "ogImage")?.url).toBe(
      "https://cdn/share.jpg",
    );
    expect(roleImage(fields, meta, "featured")?.url).toBe(
      "https://cdn/hero.jpg",
    );
  });

  test("field name is free — any tagged key resolves", () => {
    const image = roleImage(
      [mediaField("coverPhoto", "featured")],
      { coverPhoto: mediaRef("https://cdn/cover.jpg") },
      "featured",
    );
    expect(image?.url).toBe("https://cdn/cover.jpg");
  });

  test("falls through to the next field of the same role", () => {
    const image = roleImage(
      [mediaField("primary", "ogImage"), mediaField("fallback", "ogImage")],
      { primary: null, fallback: mediaRef("https://cdn/fallback.jpg") },
      "ogImage",
    );
    expect(image?.url).toBe("https://cdn/fallback.jpg");
  });

  test("returns null when no role-tagged field has a value", () => {
    const image = roleImage([mediaField("hero", "featured")], {}, "featured");
    expect(image).toBeNull();
  });

  test("returns null when no field carries a role", () => {
    const image = roleImage(
      [mediaField("hero")],
      { hero: mediaRef("https://cdn/hero.jpg") },
      "featured",
    );
    expect(image).toBeNull();
  });

  test("a value without a usable url string is treated as absent", () => {
    const image = roleImage(
      [mediaField("share", "ogImage"), mediaField("spare", "ogImage")],
      {
        share: { id: "m1", url: "" },
        spare: mediaRef("https://cdn/spare.jpg"),
      },
      "ogImage",
    );
    expect(image?.url).toBe("https://cdn/spare.jpg");
  });
});

describe("entryRoleImage", () => {
  test("scopes the walk to the entry type's own fields", () => {
    const registry = registryWith(["page"], [mediaField("hero", "featured")]);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    expect(entryRoleImage(registry, data, "featured")).toBeNull();
  });

  test("resolves the role off the type that registered it", () => {
    const registry = registryWith(["post"], [mediaField("hero", "featured")]);
    const data = entryData("post", { hero: mediaRef("https://cdn/hero.jpg") });

    expect(entryRoleImage(registry, data, "featured")?.url).toBe(
      "https://cdn/hero.jpg",
    );
  });

  test("a page that is not a single entry has no role image", () => {
    const registry = registryWith(["post"], [mediaField("hero", "featured")]);
    const archive = { kind: "archive" } as unknown as TemplateData;

    expect(entryRoleImage(registry, archive, "featured")).toBeNull();
  });
});
