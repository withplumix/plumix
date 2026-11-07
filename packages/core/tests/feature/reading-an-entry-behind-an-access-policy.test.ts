import { describe, expect, test } from "vitest";

import { ACCESS_POLICY_META_KEY } from "../../src/access/contract/meta-key.js";
import { anonymousPolicy, capabilityPolicy } from "../../src/access/policy.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const pagesWithAccess = definePlugin("pages-with-access", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      access: {
        default: anonymousPolicy,
        policies: [
          {
            key: "staff",
            label: "Staff",
            policy: capabilityPolicy("user:list"),
          },
        ],
      },
    });
  },
});

const site = await testSite({ plugins: [pagesWithAccess] });

/** A page anyone may read, and one only staff may. */
async function publishPages() {
  const author = await site.factory.admin.create();
  await site.factory.published.create({
    authorId: author.id,
    type: "page",
    slug: "public-page",
  });
  const staff = await site.factory.published.create({
    authorId: author.id,
    type: "page",
    slug: "staff-page",
    meta: { [ACCESS_POLICY_META_KEY]: "staff" },
  });
  return { staff };
}

describe("an entry type with an access policy", () => {
  test("a list leaves out a published entry its policy refuses the caller", async () => {
    await publishPages();

    const rows = await site.actingAs("member").rpc.entry.list({ type: "page" });

    expect(rows.map((row) => row.slug)).toEqual(["public-page"]);
  });

  test("reading an entry its policy refuses the caller answers not found", async () => {
    const { staff } = await publishPages();

    const get = site.actingAs("member").rpc.entry.get({ id: staff.id });

    await expect(get).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("an editor's list shows both", async () => {
    await publishPages();

    const rows = await site.actingAs("editor").rpc.entry.list({ type: "page" });

    expect(rows.map((row) => row.slug).sort()).toEqual([
      "public-page",
      "staff-page",
    ]);
  });
});
