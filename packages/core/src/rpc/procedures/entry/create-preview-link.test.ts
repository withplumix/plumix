import { describe, expect, test } from "vitest";

import { verifyPreviewToken } from "../../../auth/preview-token.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

// buildEntryPermalinkSync needs the type registered + public to form a URL.
function postRegistry() {
  const registry = createPluginRegistry();
  registry.entryTypes.set("post", {
    name: "post",
    registeredBy: "test",
    label: "Posts",
    capabilityType: "post",
    isPublic: true,
  });
  return registry;
}

describe("entry.createPreviewLink", () => {
  test("mints a token-bearing preview url for a draft the caller can edit", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: postRegistry(),
    });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "secret-draft",
    });

    const result = await h.client.entry.createPreviewLink({ id: draft.id });

    expect(result.url).toBe(`/post/secret-draft?preview=${result.token}`);
    expect(await verifyPreviewToken(h.db, result.token)).toBe(draft.id);
  });

  test("mints an ancestor-walked url for a nested page of a hierarchical type", async () => {
    const registry = createPluginRegistry();
    registry.entryTypes.set("page", {
      name: "page",
      registeredBy: "test",
      label: "Pages",
      capabilityType: "page",
      isPublic: true,
      isHierarchical: true,
    });
    // entry:page:* aren't builtin (only entry:post:* are), so register the
    // caps canReadEntry consults — `registry.entryTypes.set` skips the
    // derivation `ctx.registerEntryType` does in the real flow.
    for (const [action, minRole] of [
      ["read", "subscriber"],
      ["edit_own", "contributor"],
      ["edit_any", "editor"],
    ] as const) {
      registry.capabilities.set(`entry:page:${action}`, {
        name: `entry:page:${action}`,
        minRole,
        registeredBy: "test",
      });
    }
    const h = await createRpcHarness({ authAs: "editor", plugins: registry });
    const parent = await h.factory.published.create({
      authorId: h.user.id,
      type: "page",
      slug: "docs",
    });
    const child = await h.factory.draft.create({
      authorId: h.user.id,
      type: "page",
      slug: "unreleased",
      parentId: parent.id,
    });

    const result = await h.client.entry.createPreviewLink({ id: child.id });
    expect(result.url).toBe(`/page/docs/unreleased?preview=${result.token}`);
  });

  test("404s a draft the caller can't read (no link-minting for others' drafts)", async () => {
    const h = await createRpcHarness({
      authAs: "contributor",
      plugins: postRegistry(),
    });
    // A draft authored by someone else — a contributor has neither
    // edit_any nor authorship, so canReadEntry is false.
    const other = await h.factory.user.create();
    const draft = await h.factory.draft.create({
      authorId: other.id,
      slug: "not-mine",
    });

    await expect(
      h.client.entry.createPreviewLink({ id: draft.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("404s a non-existent entry", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: postRegistry(),
    });
    await expect(
      h.client.entry.createPreviewLink({ id: 9999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
