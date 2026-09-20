import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../plugin/manifest.js";
import type { PluginSetupContext } from "../plugin/setup-context.js";
import type { PhotoReference } from "../test/photo-lookup.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../plugin/register.js";
import {
  photoField,
  photoLookupAdapter,
  photoProfilePlugin,
  photoUrl,
} from "../test/photo-lookup.js";
import { createTracedContext } from "../test/traced-context.js";
import { projectImageRoles, resolveImageRoles } from "./role-images.js";

declare module "../plugin/image-roles.js" {
  interface ImageRoles {
    hero: true;
  }
}

function groupField(
  key: string,
  fields: readonly MetaBoxField[],
): MetaBoxField {
  return { key, label: key, type: "json", inputType: "group", fields };
}

function hydratedPhoto(id: string, usable = true): PhotoReference {
  return { id, src: photoUrl(id), usable };
}

const sitePlugin = (ctx: PluginSetupContext): void => {
  ctx.registerLookupAdapter({ kind: "photo", adapter: photoLookupAdapter });
  ctx.registerImageRole("hero", { single: false });
  ctx.registerEntryType("post", { label: "Posts" });
  ctx.registerEntryMetaBox("appearance", {
    label: "Appearance",
    entryTypes: ["post"],
    fields: [
      groupField("layout", [
        groupField("header", [photoField("cover", { role: "featured" })]),
      ]),
      photoField("primaryHero", { role: "hero" }),
      photoField("backupHero", { role: "hero" }),
    ],
  });
};

async function registryFrom(setup: (ctx: PluginSetupContext) => void) {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [definePlugin("site", setup)],
  });
  return registry;
}

describe("projectImageRoles", () => {
  test("resolves a role field nested in a group through the adapter's image()", async () => {
    const registry = await registryFrom(sitePlugin);

    const images = projectImageRoles(
      registry,
      { kind: "entry", entryType: "post" },
      { layout: { header: { cover: hydratedPhoto("7") } } },
    );

    expect(images.featured).toEqual({ url: photoUrl(7), alt: null });
  });

  test("falls through to the next field in the role, then to null", async () => {
    const registry = await registryFrom(sitePlugin);
    const project = (meta: Record<string, unknown>) =>
      projectImageRoles(registry, { kind: "entry", entryType: "post" }, meta);

    // An orphaned single reference hydrates to null.
    expect(
      project({ primaryHero: null, backupHero: hydratedPhoto("2") }).hero,
    ).toEqual({ url: photoUrl(2), alt: null });
    // A payload the adapter refuses (a non-image mime) falls through too.
    expect(
      project({
        primaryHero: hydratedPhoto("1", false),
        backupHero: hydratedPhoto("2"),
      }).hero,
    ).toEqual({ url: photoUrl(2), alt: null });
    expect(project({ primaryHero: null, backupHero: null }).hero).toBeNull();
  });

  test("omits a role no field in the scope carries", async () => {
    const registry = await registryFrom((ctx) => {
      sitePlugin(ctx);
      ctx.registerTermTaxonomy("category", { label: "Categories" });
    });

    const images = projectImageRoles(
      registry,
      { kind: "term", taxonomy: "category" },
      {},
    );

    expect(images).toEqual({});
  });

  test("keeps only the roles whose fields an include predicate admits", async () => {
    const registry = await registryFrom((ctx) => {
      ctx.registerLookupAdapter({ kind: "photo", adapter: photoLookupAdapter });
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryMetaBox("appearance", {
        label: "Appearance",
        entryTypes: ["post"],
        fields: [
          photoField("cover", { role: "featured" }),
          photoField("share", { role: "ogImage", showInApi: true }),
        ],
      });
    });

    const images = projectImageRoles(
      registry,
      { kind: "entry", entryType: "post" },
      { cover: hydratedPhoto("7"), share: hydratedPhoto("8") },
      { include: (field) => field.showInApi === true },
    );

    expect(images).toEqual({ ogImage: { url: photoUrl(8), alt: null } });
  });
});

describe("resolveImageRoles", () => {
  const batchPlugin = definePlugin("batch-site", sitePlugin);

  test("hydrates the ids of every stored bag in one query", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [batchPlugin],
    });
    const author = await harness.factory.user.create({});
    const photos = await Promise.all(
      Array.from({ length: 3 }, () =>
        harness.factory.entry.create({ authorId: author.id, type: "post" }),
      ),
    );
    const bags = photos.map((photo) => ({
      layout: { header: { cover: String(photo.id) } },
    }));

    const images = await run(() =>
      resolveImageRoles(ctx, { kind: "entry", entryType: "post" }, bags),
    );

    expect(images.map((bag) => bag.featured?.url)).toEqual(
      photos.map((photo) => photoUrl(photo.id)),
    );
    // One `IN (...)` for every id of every bag — no per-bag fan-out.
    expect(dbQueryCount()).toBe(1);
  });

  test("splits a batch wider than one statement's id limit into chunks", async () => {
    const { ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [batchPlugin],
    });
    // 150 distinct ids, none of which exist: the chunking is about how many
    // statements the ids are bound across, not about what they resolve to.
    const bags = Array.from({ length: 150 }, (_, index) => ({
      layout: { header: { cover: String(index + 1) } },
    }));

    const images = await run(() =>
      resolveImageRoles(ctx, { kind: "entry", entryType: "post" }, bags),
    );

    expect(images.every((bag) => bag.featured === null)).toBe(true);
    expect(dbQueryCount()).toBe(2);
  });

  test("reads an id the bag still holds in the retired snapshot shape", async () => {
    const { harness, ctx, run } = await createTracedContext({
      plugins: [batchPlugin],
    });
    const author = await harness.factory.user.create({});
    const photo = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
    });

    // A bag nothing has settled since `{ id, … }` was retired. The hydrated
    // path heals it through `decodeMetaBag`; the raw-column path must agree.
    const [images] = await run(() =>
      resolveImageRoles(ctx, { kind: "entry", entryType: "post" }, [
        { layout: { header: { cover: { id: String(photo.id), label: "x" } } } },
      ]),
    );

    expect(images?.featured).toEqual({ url: photoUrl(photo.id), alt: null });
  });

  test("reads a user's roles out of stored user meta", async () => {
    const { harness, ctx, run } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });
    const author = await harness.factory.user.create({});
    const photo = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
    });

    const [images] = await run(() =>
      resolveImageRoles(ctx, { kind: "user" }, [
        { portrait: String(photo.id) },
        {},
      ]),
    );

    expect(images?.featured).toEqual({ url: photoUrl(photo.id), alt: null });
  });
});
