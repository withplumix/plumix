import { describe, expect, test, vi } from "vitest";

import type { ConnectedCdn } from "../runtime/contract/slots.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { defineBlock, parseRenderEnv } from "../blocks/index.js";
import { BlockRenderer } from "../blocks/renderer/index.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { entry, entryType, fallback } from "./render/template-builders.js";

declare module "../blocks/deps.js" {
  interface TemplateDepRegistry {
    "block-menus": { location: string; result: string };
  }
}

const ks2Block = defineBlock({
  name: "eduscope/ks2",
  deps: { settings: ["school_ks2"] },
  render: ({ deps }) => {
    const title = deps.settings.school_ks2?.title;
    return <h2>{typeof title === "string" ? title : "no copy"}</h2>;
  },
});

const schoolPlugin = definePlugin("school", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerBlock(ks2Block);
});

/** A theme with no dep declarations of its own: the block brings its own. */
const plainTheme = defineTheme({
  templates: [
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    fallback(() => null),
  ],
});

async function seedPost(
  h: DispatcherHarness,
  blocks: readonly Record<string, unknown>[],
  slug = "school",
): Promise<void> {
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug,
    title: slug,
    content: { version: "plumix.v2", blocks },
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
}

describe("a block that declares its deps", () => {
  test("renders its settings group under a template that declares nothing", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [schoolPlugin], theme: plainTheme },
    });
    await h.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await seedPost(h, [{ id: "a", name: "eduscope/ks2" }]);

    const response = await h.dispatch(
      new Request("https://cms.example/post/school"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h2>Key Stage 2</h2>");
  });

  test("twenty instances on one page load the settings dep once", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [schoolPlugin], theme: plainTheme },
    });
    const settingsDep = h.app.plugins.templateDeps.get("settings");
    if (!settingsDep) throw new Error("core registers the settings dep");
    const load = vi.spyOn(settingsDep, "load");
    await seedPost(
      h,
      Array.from({ length: 20 }, (_, i) => ({
        id: `b${String(i)}`,
        name: "eduscope/ks2",
      })),
    );

    await h.dispatch(new Request("https://cms.example/post/school"));

    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]?.[0]).toEqual(["school_ks2"]);
  });

  test("a declaration from attributes loads every instance's keys in one call", async () => {
    const loadMenus = vi.fn(({ locations }: { locations: readonly string[] }) =>
      Promise.resolve(
        Object.fromEntries(locations.map((l) => [l, `menu:${l}`])),
      ),
    );
    const menuPlugin = definePlugin("menus", (ctx) => {
      ctx.registerTemplateDep("block-menus", {
        keyedBy: "location",
        load: loadMenus,
      });
      ctx.registerBlock(
        defineBlock({
          name: "acme/nav",
          deps: (attrs: { readonly location?: string }) => ({
            "block-menus": [attrs.location ?? "primary"],
          }),
          render: ({ attrs, deps }) => (
            <nav>{deps["block-menus"][attrs.location ?? "primary"]}</nav>
          ),
        }),
      );
    });
    const h = await createDispatcherHarness({
      config: { plugins: [schoolPlugin, menuPlugin], theme: plainTheme },
    });
    await seedPost(h, [
      { id: "a", name: "acme/nav", attrs: { location: "header" } },
      { id: "b", name: "acme/nav", attrs: { location: "footer" } },
    ]);

    const response = await h.dispatch(
      new Request("https://cms.example/post/school"),
    );

    const body = await response.text();
    expect(body).toContain("<nav>menu:header</nav>");
    expect(body).toContain("<nav>menu:footer</nav>");
    expect(loadMenus).toHaveBeenCalledOnce();
    expect(loadMenus.mock.calls[0]?.[0]).toEqual({
      locations: ["header", "footer"],
    });
  });

  test("saving a group a block reads purges the stored page that renders it", async () => {
    const put = vi.fn<NonNullable<ConnectedCdn["store"]>["put"]>(() =>
      Promise.resolve(),
    );
    const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
      Promise.resolve(),
    );
    const h = await createDispatcherHarness({
      cdn: {
        decorate: (response) => response,
        store: { match: () => Promise.resolve(undefined), put },
        purgeTags,
      },
      config: { plugins: [schoolPlugin], theme: plainTheme },
    });
    await seedPost(h, [{ id: "a", name: "eduscope/ks2" }]);
    await h.dispatch(new Request("https://cms.example/post/school"));
    await h.drainDeferred();
    const storedUnder = put.mock.calls[0]?.[2] ?? [];

    const admin = await h.seedUser("admin");
    const saved = await h.fetch("/_plumix/rpc/settings/upsert", {
      as: admin,
      json: { json: { group: "school_ks2", values: { title: "KS2" } } },
    });
    saved.assertStatus(200);
    await h.drainDeferred();

    const purged = purgeTags.mock.calls.flatMap(([tags]) => [...tags]);
    expect(purged).toContain("s:school_ks2");
    expect(storedUnder).toContain("s:school_ks2");
  });

  test("an archive loads its listed entries' block deps once for the page", async () => {
    const archiveTheme = defineTheme({
      templates: [
        entryType(({ data }) => (
          <main>
            {data.entries.map((listed) => (
              <BlockRenderer key={listed.id} content={listed.contentBlocks} />
            ))}
          </main>
        )),
        fallback(() => null),
      ],
    });
    const h = await createDispatcherHarness({
      config: { plugins: [schoolPlugin], theme: archiveTheme },
    });
    const settingsDep = h.app.plugins.templateDeps.get("settings");
    if (!settingsDep) throw new Error("core registers the settings dep");
    const load = vi.spyOn(settingsDep, "load");
    await h.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await seedPost(h, [{ id: "a", name: "eduscope/ks2" }], "first");
    await seedPost(h, [{ id: "b", name: "eduscope/ks2" }], "second");

    const response = await h.dispatch(new Request("https://cms.example/post"));

    const body = await response.text();
    expect(body.match(/<h2>Key Stage 2<\/h2>/g)).toHaveLength(2);
    expect(load).toHaveBeenCalledOnce();
  });

  test("the editor canvas render carries the block's deps to the canvas", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [schoolPlugin], theme: plainTheme },
    });
    await h.factory.setting.create({
      group: "school_ks2",
      key: "title",
      value: "Key Stage 2",
    });
    await seedPost(h, [{ id: "a", name: "eduscope/ks2" }]);
    const editor = await h.seedUser("admin");

    const response = await h.dispatch(
      await h.authenticateRequest(
        new Request("https://cms.example/post/school?plumix.edit"),
        editor.id,
      ),
    );

    const body = await response.text();
    const embed = /data-plumix-render-env="">(.*?)<\/script>/.exec(body)?.[1];
    expect(parseRenderEnv(embed ?? "").deps).toEqual({
      settings: { school_ks2: { title: "Key Stage 2" } },
    });
  });
});
