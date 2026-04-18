import { describe, expect, test, vi } from "vitest";

import { createRpcHarness } from "../../../test/rpc.js";
import {
  applyPostBeforeSave,
  firePostPublished,
  firePostTransition,
} from "./lifecycle.js";

describe("lifecycle — WordPress-style hook fan-out", () => {
  test("type-specific filter runs before the generic filter on save", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const trail: string[] = [];

    h.hooks.addFilter("landing_page:before_save", (post) => {
      trail.push("specific");
      return { ...post, title: `[specific] ${post.title}` };
    });
    h.hooks.addFilter("post:before_save", (post) => {
      trail.push("generic");
      return { ...post, title: `[generic] ${post.title}` };
    });

    const result = await applyPostBeforeSave(h.context, "landing_page", {
      type: "landing_page",
      title: "raw",
      slug: "raw",
      authorId: h.user.id,
      status: "draft",
    });

    expect(trail).toEqual(["specific", "generic"]);
    expect(result.title).toBe("[generic] [specific] raw");
  });

  test("firePostPublished fires both specific and generic actions", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onSpecific = vi.fn();
    const onGeneric = vi.fn();
    h.hooks.addAction("landing_page:published", onSpecific);
    h.hooks.addAction("post:published", onGeneric);

    const row = await h.factory.published.create({
      type: "landing_page",
      authorId: h.user.id,
      slug: "specific-and-generic",
    });
    await firePostPublished(h.context, row);

    expect(onSpecific).toHaveBeenCalledTimes(1);
    expect(onGeneric).toHaveBeenCalledTimes(1);
  });

  test("firePostTransition is a no-op when new === old status", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onTransition = vi.fn();
    h.hooks.addAction("post:transition", onTransition);

    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "same-status",
    });
    await firePostTransition(h.context, draft, "draft");
    expect(onTransition).not.toHaveBeenCalled();

    await firePostTransition(
      h.context,
      { ...draft, status: "published" },
      "draft",
    );
    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  test("for built-in 'post' type, only the generic hook fires (no duplicate)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const onGeneric = vi.fn();
    h.hooks.addAction("post:trashed", onGeneric);

    const row = await h.factory.published.create({
      authorId: h.user.id,
      slug: "no-duplicate",
    });
    await h.client.post.trash({ id: row.id });
    expect(onGeneric).toHaveBeenCalledTimes(1);
  });
});
