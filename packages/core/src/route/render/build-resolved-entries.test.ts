import { describe, expect, test } from "vitest";

import { definePlugin } from "../../plugin/define.js";
import { createTracedContext } from "../../test/traced-context.js";
import { buildResolvedEntries } from "./build-resolved-entries.js";

describe("buildResolvedEntries author memoization", () => {
  test("a second call with an already-seen author skips the author query", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    const author = await harness.factory.user.create({ name: "Ada" });
    const [post, other] = await Promise.all([
      harness.factory.entry.create({ authorId: author.id }),
      harness.factory.entry.create({ authorId: author.id }),
    ]);

    const [first, second] = await run(async () => [
      await buildResolvedEntries(ctx, [post]),
      await buildResolvedEntries(ctx, [other]),
    ]);

    expect(first[0]?.author.name).toBe("Ada");
    expect(second[0]?.author.name).toBe("Ada");
    // Call 1: author query + terms join. Call 2: terms join only —
    // the author row replays from the request memo.
    expect(dbQueryCount()).toBe(3);
  });

  test("a mixed batch still resolves authors not yet memoized", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    const ada = await harness.factory.user.create({ name: "Ada" });
    const lin = await harness.factory.user.create({ name: "Lin" });
    const [adaPost, adaOther, linPost] = await Promise.all([
      harness.factory.entry.create({ authorId: ada.id }),
      harness.factory.entry.create({ authorId: ada.id }),
      harness.factory.entry.create({ authorId: lin.id }),
    ]);

    const [, mixed] = await run(async () => [
      await buildResolvedEntries(ctx, [adaPost]),
      await buildResolvedEntries(ctx, [adaOther, linPost]),
    ]);

    expect(mixed.map((e) => e.author.name).sort()).toEqual(["Ada", "Lin"]);
    // One batched author query per call at most — no per-id fan-out.
    expect(dbQueryCount()).toBe(4);
  });
});

describe("buildResolvedEntries reference meta hydration", () => {
  const refsPlugin = definePlugin("test-refs", (ctx) => {
    ctx.registerEntryMetaBox("relations", {
      label: "Relations",
      entryTypes: ["post"],
      fields: [
        {
          key: "related",
          label: "Related",
          inputType: "entryList",
          type: "json",
          referenceTarget: {
            kind: "entry",
            scope: { entryTypes: ["post"] },
            multiple: true,
          },
        },
      ],
    });
  });

  test("templates receive hydrated reference meta, batched across the archive", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [refsPlugin],
    });
    const author = await harness.factory.user.create({});
    const targets = await Promise.all(
      Array.from({ length: 2 }, (_, i) =>
        harness.factory.entry.create({
          authorId: author.id,
          type: "post",
          status: "published",
          title: `Target ${String(i)}`,
        }),
      ),
    );
    const targetIds = targets.map((t) => String(t.id));
    // A referenced draft must not leak its title through anonymous
    // hydration — it reads as absent, exactly like a deleted target.
    const draft = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "draft",
      title: "Unpublished",
    });
    const rows = await Promise.all(
      Array.from({ length: 3 }, () =>
        harness.factory.entry.create({
          authorId: author.id,
          type: "post",
          status: "published",
          meta: { related: [...targetIds, String(draft.id), "999999"] },
        }),
      ),
    );

    const resolved = await run(() => buildResolvedEntries(ctx, rows));

    for (const entry of resolved) {
      const related = entry.meta.related as {
        id: string;
        title: string | null;
        slug: string;
        url: string | null;
      }[];
      // Hydrated one level deep, orphans dropped, order preserved.
      expect(related.map((r) => r.id)).toEqual(targetIds);
      expect(related[0]?.title).toBe("Target 0");
      // A hydrated summary is not a full entry — its own meta (and any
      // reference fields inside it) never expands.
      expect(related[0]).not.toHaveProperty("meta");
    }
    // author query + terms join + ONE entry in-query for all reference
    // fields of all three entries.
    expect(dbQueryCount()).toBe(3);
  });
});
