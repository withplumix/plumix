import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";
import { REVISION_TYPE } from "./slug-codec.js";

function registryWithRevisions(opts?: { maxRevisions?: number }) {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    label: "Posts",
    supports: ["revisions"],
    versioning: {
      maxRevisions: opts?.maxRevisions ?? 25,
      autosaveIntervalSeconds: 60,
    },
    registeredBy: "test",
  });
  return plugins;
}

describe("entry.update revision capture", () => {
  test("does NOT capture when the entry type doesn't opt into revisions", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.entry.create({
      title: "Plain",
      slug: "plain",
    });
    await h.client.entry.update({ id: created.id, title: "Plain v2" });
    const revisions = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    expect(revisions).toHaveLength(0);
  });

  test("prunes the oldest revisions past maxRevisions", async () => {
    const h = await createRpcHarness({
      authAs: "author",
      plugins: registryWithRevisions({ maxRevisions: 2 }),
    });
    const created = await h.client.entry.create({
      title: "P",
      slug: "p",
    });
    for (let i = 0; i < 3; i += 1) {
      await h.client.entry.update({ id: created.id, title: `P v${i + 1}` });
    }
    const revisions = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    expect(revisions).toHaveLength(2);
  });

  test("fires entry:revision_created action on capture", async () => {
    const h = await createRpcHarness({
      authAs: "author",
      plugins: registryWithRevisions(),
    });
    const onCreated = h.spyAction("entry:revision_created");
    const created = await h.client.entry.create({
      title: "X",
      slug: "x",
    });
    await h.client.entry.update({ id: created.id, title: "X v2" });
    onCreated.assertCalledOnce();
  });

  test("captures a revision row on a successful update of a revisions-supporting type", async () => {
    const h = await createRpcHarness({
      authAs: "author",
      plugins: registryWithRevisions(),
    });
    const created = await h.client.entry.create({
      title: "First",
      slug: "first",
    });
    const before = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    expect(before).toHaveLength(0);

    await h.client.entry.update({
      id: created.id,
      title: "Second",
    });

    const after = await h.db.query.entries.findMany({
      where: eq(entries.type, REVISION_TYPE),
    });
    expect(after).toHaveLength(1);
    const [revision] = after;
    if (!revision) throw new Error("expected one captured revision");
    expect(revision.title).toBe("Second");
    expect(revision.authorId).toBe(h.user.id);
  });
});
