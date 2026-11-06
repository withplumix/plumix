import { describe, expect, test, vi } from "vitest";

import { entry } from "../../../hooks/entry.js";
import { createRpcHarness } from "../../../test/rpc.js";
import {
  applyEntryBeforeSave,
  fireEntryPublished,
  fireEntryTransition,
} from "./lifecycle.js";

describe("lifecycle — scoped and unscoped event fan-out", () => {
  test("a type-scoped beforeSave runs before the unscoped one on save", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const trail: string[] = [];

    h.hooks.add(entry.for("landing_page").beforeSave, (post) => {
      trail.push("specific");
      return { ...post, title: `[specific] ${post.title}` };
    });
    h.hooks.add(entry.beforeSave, (post) => {
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

  test("fireEntryPublished runs both scoped and unscoped handlers", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onSpecific = vi.fn();
    const onGeneric = vi.fn();
    h.hooks.on(entry.for("landing_page").published, onSpecific);
    h.hooks.on(entry.published, onGeneric);

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
    h.hooks.on(entry.transition, onTransition);

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

  test("a type-scoped handler runs on the default 'post' type too (`entry.for(\"post\").trashed`)", async () => {
    // Plugins can target the default entry type by name with
    // `entry.for("post")`, not only the unscoped event plus a type check.
    const h = await createRpcHarness({ authAs: "admin" });
    const onScoped = vi.fn();
    const onGeneric = vi.fn();
    h.hooks.on(entry.for("post").trashed, onScoped);
    h.hooks.on(entry.trashed, onGeneric);

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
