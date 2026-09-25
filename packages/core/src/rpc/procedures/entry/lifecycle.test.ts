import { describe, expect, test, vi } from "vitest";

import { createRpcHarness } from "../../../test/rpc.js";
import {
  applyEntryBeforeSave,
  fireEntryPublished,
  fireEntryTransition,
} from "./lifecycle.js";

describe("lifecycle — WordPress-style hook fan-out", () => {
  test("type-specific filter runs before the generic filter on save", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const trail: string[] = [];

    h.hooks.addFilter("entry:landing_page:before_save", (post) => {
      trail.push("specific");
      return { ...post, title: `[specific] ${post.title}` };
    });
    h.hooks.addFilter("entry:before_save", (post) => {
      trail.push("generic");
      return { ...post, title: `[generic] ${post.title}` };
    });

    const result = await applyEntryBeforeSave(h.context, "landing_page", {
      type: "landing_page",
      title: "raw",
      slug: "raw",
      authorId: h.user.id,
      status: "draft",
    });

    expect(trail).toEqual(["specific", "generic"]);
    expect(result.title).toBe("[generic] [specific] raw");
  });

  test("fireEntryPublished fires both specific and generic actions", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onSpecific = vi.fn();
    const onGeneric = vi.fn();
    h.hooks.addAction("entry:landing_page:published", onSpecific);
    h.hooks.addAction("entry:published", onGeneric);

    const row = await h.factory.published.create({
      type: "landing_page",
      authorId: h.user.id,
      slug: "specific-and-generic",
    });
    await fireEntryPublished(h.context, row);

    expect(onSpecific).toHaveBeenCalledTimes(1);
    expect(onGeneric).toHaveBeenCalledTimes(1);
  });

  test("fireEntryTransition is a no-op when new === old status", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onTransition = vi.fn();
    h.hooks.addAction("entry:transition", onTransition);

    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "same-status",
    });
    await fireEntryTransition(h.context, draft, "draft");
    expect(onTransition).not.toHaveBeenCalled();

    await fireEntryTransition(
      h.context,
      { ...draft, status: "published" },
      "draft",
    );
    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  test("type-scoped hook fires on the default 'post' type too (`entry:post:trashed`)", async () => {
    // Dropping the `if (type !== "post")` guard means plugins can target
    // the default entry type by name with `entry:post:*` — no longer
    // forced to use the generic hook + type-check inside the handler.
    const h = await createRpcHarness({ authAs: "admin" });
    const onScoped = vi.fn();
    const onGeneric = vi.fn();
    h.hooks.addAction("entry:post:trashed", onScoped);
    h.hooks.addAction("entry:trashed", onGeneric);

    const row = await h.factory.published.create({
      authorId: h.user.id,
      slug: "scoped-and-generic",
    });
    await h.client.entry.trash({ id: row.id });
    expect(onScoped).toHaveBeenCalledTimes(1);
    expect(onGeneric).toHaveBeenCalledTimes(1);
  });
});

describe("the trash lifecycle refuses a revision row as not-found", () => {
  // An admin holds every registered capability, and the revision row is
  // theirs and already in the bin — so nothing but its type can refuse it.
  async function seedRevision() {
    const h = await createRpcHarness({ authAs: "admin" });
    const live = await h.factory.trashed.create({
      authorId: h.user.id,
      slug: "live",
    });
    const revision = await h.factory.trashed.create({
      authorId: h.user.id,
      type: "revision",
      slug: `revision:${String(live.id)}:abcdefghijklmnopqrstu`,
    });
    return { h, live, revision };
  }

  const notFound = (id: number) => ({
    code: "NOT_FOUND",
    data: { kind: "entry", id },
  });

  test("trash", async () => {
    const { h, revision } = await seedRevision();
    await expect(
      h.client.entry.trash({ id: revision.id }),
    ).rejects.toMatchObject(notFound(revision.id));
  });

  test("restore", async () => {
    const { h, revision } = await seedRevision();
    await expect(
      h.client.entry.restore({ id: revision.id }),
    ).rejects.toMatchObject(notFound(revision.id));
  });

  test("delete-permanent", async () => {
    const { h, revision } = await seedRevision();
    await expect(
      h.client.entry.deletePermanent({ id: revision.id }),
    ).rejects.toMatchObject(notFound(revision.id));
  });

  test("each bulk procedure, even beside a live entry", async () => {
    const { h, live, revision } = await seedRevision();
    const ids = [live.id, revision.id];
    await expect(h.client.entry.trashMany({ ids })).rejects.toMatchObject(
      notFound(revision.id),
    );
    await expect(h.client.entry.restoreMany({ ids })).rejects.toMatchObject(
      notFound(revision.id),
    );
    await expect(
      h.client.entry.deletePermanentMany({ ids }),
    ).rejects.toMatchObject(notFound(revision.id));
  });
});
