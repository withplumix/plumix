import { describe, expect, test } from "vitest";

import type { TemplateData } from "../../theme.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/builder.js";
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
// The same two decode moves, on a term. Before the render path decoded
// term meta these read back as the raw ISO string and the raw id.
const _termDossierFields = [
  date("taggedOn").returns("date"),
  entryRef("curator", ["post"]),
  text("termTone").default("warm"),
];
declare module "../../plugin/fields/contributions.js" {
  interface EntryMetaContributions {
    dossier: { entryTypes: "post"; fields: typeof _dossierFields };
  }
  interface TermMetaContributions {
    termDossier: {
      termTaxonomies: "dossierTopic";
      fields: typeof _termDossierFields;
    };
  }
}

const dossierPlugin = definePlugin("test-dossier", (ctx) => {
  ctx.registerEntryMetaBox("dossier", {
    label: "Dossier",
    entryTypes: ["post"],
    fields: _dossierFields,
  });
  ctx.registerTermTaxonomy("dossierTopic", {
    label: "Dossier Topics",
    entryTypes: ["post"],
  });
  ctx.registerTermMetaBox("termDossier", {
    label: "Term Dossier",
    termTaxonomies: ["dossierTopic"],
    fields: _termDossierFields,
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

describe("term meta on the render path", () => {
  test("a term's meta is decoded and reference-hydrated, beside the raw storedMeta", async () => {
    const { harness, ctx, run } = await createTracedContext({
      plugins: [dossierPlugin],
    });
    const author = await harness.factory.user.create({});
    const curator = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
      title: "Curator",
    });
    const row = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
    });
    const term = await harness.factory.term.create({
      taxonomy: "dossierTopic",
      meta: { taggedOn: "2026-02-03", curator: String(curator.id) },
    });
    await harness.factory.entryTerm.create({
      entryId: row.id,
      termId: term.id,
    });

    const [entry] = await run(() => buildResolvedEntries(ctx, [row]));
    const [resolved] = entry?.terms ?? [];
    if (!resolved) throw new Error("buildResolvedEntries returned no term");

    // What a template reads off `data.entry.terms[n].meta`.
    expect(resolved.meta.taggedOn).toEqual(
      new Date("2026-02-03T00:00:00.000Z"),
    );
    expect(resolved.meta.curator).toMatchObject({
      id: String(curator.id),
      title: "Curator",
    });
    // What a term rule predicate reads: the JSON column, untouched.
    expect(resolved.storedMeta).toEqual({
      taggedOn: "2026-02-03",
      curator: String(curator.id),
    });
  });

  test("a `.default()` key absent from storage reads back the declared default", async () => {
    const { harness, ctx, run } = await createTracedContext({
      plugins: [dossierPlugin],
    });
    const author = await harness.factory.user.create({});
    const row = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
    });
    const term = await harness.factory.term.create({
      taxonomy: "dossierTopic",
      meta: {},
    });
    await harness.factory.entryTerm.create({
      entryId: row.id,
      termId: term.id,
    });

    const [entry] = await run(() => buildResolvedEntries(ctx, [row]));
    const [resolved] = entry?.terms ?? [];
    if (!resolved) throw new Error("buildResolvedEntries returned no term");

    expect(resolved.meta.termTone).toBe("warm");
    // The column itself is untouched — a rule predicate still sees no key.
    expect(resolved.storedMeta).toEqual({});
  });

  test("a term on two entries decodes per attachment, in one batched reference query", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [dossierPlugin],
    });
    const author = await harness.factory.user.create({});
    const curator = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
      status: "published",
      title: "Curator",
    });
    const [first, second] = await Promise.all([
      harness.factory.entry.create({ authorId: author.id, type: "post" }),
      harness.factory.entry.create({ authorId: author.id, type: "post" }),
    ]);
    // `shared` sits on both entries and `solo` on the second only, so a
    // dedupe-by-term-id that forgot to remap indices would misalign here.
    const shared = await harness.factory.term.create({
      taxonomy: "dossierTopic",
      meta: { taggedOn: "2026-02-03", curator: String(curator.id) },
    });
    const solo = await harness.factory.term.create({
      taxonomy: "dossierTopic",
      meta: { taggedOn: "2026-04-05", curator: String(curator.id) },
    });
    await Promise.all([
      harness.factory.entryTerm.create({
        entryId: first.id,
        termId: shared.id,
      }),
      harness.factory.entryTerm.create({
        entryId: second.id,
        termId: shared.id,
      }),
      harness.factory.entryTerm.create({ entryId: second.id, termId: solo.id }),
    ]);

    const entries = await run(() => buildResolvedEntries(ctx, [first, second]));
    const byId = new Map(entries.map((e) => [e.id, e]));
    const onFirst = byId.get(first.id)?.terms ?? [];
    const onSecond = byId.get(second.id)?.terms ?? [];

    expect(onFirst.map((t) => t.id)).toEqual([shared.id]);
    expect(onSecond.map((t) => t.id).sort()).toEqual(
      [shared.id, solo.id].sort(),
    );
    // Every attachment carries the bag its own term stored — not a
    // neighbour's, which is what an index slip would produce.
    for (const term of [...onFirst, ...onSecond]) {
      const expected = term.id === shared.id ? "2026-02-03" : "2026-04-05";
      expect(term.meta.taggedOn).toEqual(new Date(`${expected}T00:00:00.000Z`));
      expect(term.storedMeta.taggedOn).toBe(expected);
      expect(term.meta.curator).toMatchObject({ title: "Curator" });
    }
    // Authors, the entry_term join, and one `IN(...)` for the curator ids
    // shared across all three attachments — no per-term fan-out.
    expect(dbQueryCount()).toBe(3);
  });
});
