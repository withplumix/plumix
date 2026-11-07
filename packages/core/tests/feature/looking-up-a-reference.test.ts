import { describe, expect, test } from "vitest";

import { entryCapability } from "../../src/access/contract/capability.js";
import { definePlugin } from "../../src/plugin/define.js";
import { photoLookupAdapter } from "../../src/test/photo-lookup.js";
import { testSite } from "../../src/test/site.js";

/** Core alone: its `user`, `entry` and `term` lookup adapters, no entry types. */
const site = await testSite({ plugins: [] });

/** `news` pools onto `post`'s capabilities; `photo` is gated on news editing. */
const newsPhotos = definePlugin("news-photos", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
    ctx.registerLookupAdapter({
      kind: "photo",
      adapter: photoLookupAdapter,
      capability: entryCapability("news", "edit_any"),
    });
  },
});

const pooledSite = await testSite({ plugins: [newsPhotos] });

describe("looking up a reference", () => {
  test("lists what the kind's adapter matches for the query", async () => {
    await site.factory.user.create({
      email: "alpha@example.test",
      name: "Alpha",
    });
    await site.factory.user.create({
      email: "beta@example.test",
      name: "Beta",
    });

    const result = await site
      .actingAs("admin")
      .rpc.lookup.list({ kind: "user", query: "alpha" });

    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("Alpha");
    expect(labels).not.toContain("Beta");
  });

  test("is not found for a kind no adapter is registered for", async () => {
    const lookup = site.actingAs("admin").rpc.lookup.list({
      kind: "nonexistent",
    });

    await expect(lookup).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("is refused to a visitor", async () => {
    const lookup = site.rpc.lookup.list({ kind: "user" });

    await expect(lookup).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("hands the scope to the adapter", async () => {
    await site.factory.admin.create({ name: "Admin1" });
    await site.factory.author.create({ name: "Author1" });

    const result = await site
      .actingAs("admin")
      .rpc.lookup.list({ kind: "user", scope: { roles: ["admin"] } });

    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("Admin1");
    expect(labels).not.toContain("Author1");
  });
});

describe("looking up users", () => {
  test("is forbidden to a member, who cannot list users", async () => {
    // A picker would otherwise enumerate every email and name on the site.
    await site.factory.user.create({
      email: "leak@example.test",
      name: "Leak Target",
    });

    const lookup = site.actingAs("member").rpc.lookup.list({ kind: "user" });

    await expect(lookup).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("is open to an editor, who can list users", async () => {
    const result = await site
      .actingAs("editor")
      .rpc.lookup.list({ kind: "user", limit: 1 });

    expect(result.items).toBeDefined();
  });
});

describe("looking up entries as a member", () => {
  // The entry adapter is ungated and a member is public-reachable under
  // `auth.selfSignup`, so the caller-supplied scope is the whole gate.
  test("offers published entries but not drafts", async () => {
    const author = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: author.id,
      title: "Embargoed",
      status: "draft",
    });
    const published = await site.factory.entry.create({
      authorId: author.id,
      title: "Live",
      status: "published",
    });

    const result = await site.actingAs("member").rpc.lookup.list({
      kind: "entry",
      scope: { entryTypes: ["post"] },
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(String(published.id));
    expect(ids).not.toContain(String(draft.id));
  });

  test("is refused a scope naming autosaves", async () => {
    // An autosave row carries another user's unsaved title.
    const lookup = site.actingAs("member").rpc.lookup.list({
      kind: "entry",
      scope: { entryTypes: ["autosave"] },
    });

    await expect(lookup).rejects.toThrow();
  });
});

describe("a lookup gated on an entry type's capability", () => {
  test("is open to an editor of the namespace the type pools into", async () => {
    const result = await pooledSite
      .actingAs("editor")
      .rpc.lookup.list({ kind: "photo" });

    expect(result.items).toEqual([]);
  });

  test("is forbidden to an author, naming the pooled capability", async () => {
    const lookup = pooledSite
      .actingAs("author")
      .rpc.lookup.list({ kind: "photo" });

    await expect(lookup).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });
});
