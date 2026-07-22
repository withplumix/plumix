import { describe, expect, test } from "vitest";

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
