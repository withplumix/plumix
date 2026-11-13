import { describe, test } from "vitest";

import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const scoresPlugin = definePlugin("scores", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerBlock({
      name: "school/scores",
      view: () =>
        Promise.resolve({
          default: ({ loaders, deps }) => {
            const { average } = loaders.scores as { average: number };
            const title = deps.settings.school?.title;
            const label = typeof title === "string" ? title : "no title";
            return <p>{`${label}: ${String(average)}`}</p>;
          },
          loaders: {
            scores: ({ attrs }) =>
              Promise.resolve({ average: Number(attrs.base) + 1 }),
          },
          deps: { settings: ["school"] },
        }),
    });
  },
});

const theme = defineTheme({
  templates: [
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    fallback(() => null),
  ],
});

const site = await testSite({ plugins: [scoresPlugin], config: { theme } });

async function seedScoresPost(): Promise<void> {
  await site.factory.setting.create({
    group: "school",
    key: "title",
    value: "Year 6",
  });
  await site.factory.published.create({
    type: "post",
    slug: "scores",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "s1", name: "school/scores", attrs: { base: 41 } }],
    },
  });
}

describe("a block whose view module declares loaders and deps", () => {
  test("renders its loader data and deps into the page's HTML", async () => {
    await seedScoresPost();

    const page = await site.visit("/post/scores");

    page.assertOk().assertSee("<body><div><p>Year 6: 42</p></div>");
  });

  test("embeds its loader data in the editor's render", async () => {
    await seedScoresPost();

    const page = await site.actingAs("admin").visit("/post/scores?plumix.edit");

    page.assertSee(
      '<script type="application/json" data-plumix-loader-data="">{"s1":{"scores":{"average":42}}}</script>',
    );
  });
});
