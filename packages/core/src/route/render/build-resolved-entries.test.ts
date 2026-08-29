import { describe, expect, test } from "vitest";

import type { TemplateData } from "../../theme.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { definePlugin } from "../../plugin/define.js";
import { entry as entryRef } from "../../plugin/fields/entry.js";
import { date } from "../../plugin/fields/temporal.js";
import { createTracedContext } from "../../test/traced-context.js";
import { buildResolvedEntries } from "./build-resolved-entries.js";
import { forEntryType } from "./template-builders.js";
import { resolveTemplate } from "./template-hierarchy.js";

// The two ways decoding moves a value away from what the meta JSON holds:
// `.returns("date")` reads a `Date` off a stored ISO string, and a reference
// reads the summary its lookup adapter hydrates off a stored id.
const _dossierFields = [
  date("filedOn").returns("date"),
  entryRef("subject", ["post"]),
];
declare module "../../plugin/fields/contributions.js" {
  interface EntryMetaContributions {
    dossier: { entryTypes: "post"; fields: typeof _dossierFields };
  }
}

const dossierPlugin = definePlugin("test-dossier", (ctx) => {
  ctx.registerEntryMetaBox("dossier", {
    label: "Dossier",
    entryTypes: ["post"],
    fields: _dossierFields,
  });
});

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

describe("buildResolvedEntries reference meta resolution", () => {
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
    // resolution — it reads as absent, exactly like a deleted target.
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
      // Resolved one level deep, orphans dropped, order preserved.
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

describe("whereMeta against a real row", () => {
  test("matches the stored value the read bag decoded away", async () => {
    const { harness, ctx, run } = await createTracedContext({
      plugins: [dossierPlugin],
    });
    const author = await harness.factory.user.create({});
    const subject = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
      title: "Subject",
    });
    const row = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
      meta: { filedOn: "2026-01-01", subject: String(subject.id) },
    });

    const [entry] = await run(() => buildResolvedEntries(ctx, [row]));
    if (!entry) throw new Error("buildResolvedEntries returned no entry");

    // What a template reads: decoded and hydrated.
    expect(entry.meta.filedOn).toBeInstanceOf(Date);
    expect(entry.meta.subject).toMatchObject({
      id: String(subject.id),
      title: "Subject",
    });
    // What a rule predicate reads: the JSON column, untouched.
    expect(entry.storedMeta).toEqual({
      filedOn: "2026-01-01",
      subject: String(subject.id),
    });

    const node: ResolvedNode = {
      kind: "content",
      entryType: "post",
      slug: row.slug,
      databaseId: row.id,
    };
    const data: TemplateData = { kind: "entry", entry };
    const filed = forEntryType("post")
      .whereMeta("filedOn", "2026-01-01")
      .template(() => null);
    const referenced = forEntryType("post")
      .whereMeta("subject", String(subject.id))
      .template(() => null);

    // Both values are what `whereMeta` types against, so both have to fire.
    expect(resolveTemplate([filed], node, data)).toBe(filed);
    expect(resolveTemplate([referenced], node, data)).toBe(referenced);
  });
});
