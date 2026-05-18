import { describe, expect, test } from "vitest";

import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createRpcHarness } from "../test/rpc.js";
import { buildRevisionSlug, REVISION_TYPE } from "./slug-codec.js";

function registryWithRevisions() {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    label: "Posts",
    supports: ["revisions"],
    versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
    registeredBy: "test",
  });
  return plugins;
}

describe("public entry RPCs reject the reserved revision type", () => {
  test("entry.list rejects type='revision' with BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.list({ type: "revision" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("entry.create rejects type='revision' with BAD_REQUEST", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    await expect(
      h.client.entry.create({ type: "revision", title: "x", slug: "x" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("entry.get on a revision row returns NOT_FOUND (undistinguished from missing)", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithRevisions(),
    });
    // Seed a revision row directly via DB.
    const [revision] = await h.db
      .insert(entries)
      .values({
        type: REVISION_TYPE,
        title: "snap",
        slug: buildRevisionSlug({ entryId: 999, nanoid: "abc" }),
        authorId: h.user.id,
        status: "draft",
      })
      .returning();
    if (!revision) throw new Error("seed revision");
    await expect(h.client.entry.get({ id: revision.id })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });
});
