import { describe, expect, test } from "vitest";

import { ACCESS_POLICY_META_KEY } from "../../src/access/contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
} from "../../src/access/policy.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const types = definePlugin("types", {
  setup: (ctx) => {
    // A post may be narrowed to members, entry by entry.
    ctx.registerEntryType("post", {
      label: "Posts",
      access: {
        default: anonymousPolicy,
        policies: [
          {
            key: "members",
            label: "Members only",
            policy: authenticatedPolicy,
          },
        ],
      },
    });
    ctx.registerEntryType("page", { label: "Pages" });
  },
});

const site = await testSite({ plugins: [types] });

describe("updating an entry's access choice", () => {
  test("stores a declared choice under the reserved access meta key", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "a",
      slug: "a",
    });

    const updated = await admin.rpc.entry.update({
      id: post.id,
      access: "members",
      ifMatch: post.etag,
    });

    expect(updated.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("to null clears a stored choice", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "b",
      slug: "b",
    });
    const chosen = await admin.rpc.entry.update({
      id: post.id,
      access: "members",
      ifMatch: post.etag,
    });

    const cleared = await admin.rpc.entry.update({
      id: post.id,
      access: null,
      ifMatch: chosen.etag,
    });

    expect(cleared.meta[ACCESS_POLICY_META_KEY]).toBeUndefined();
  });

  test("left out keeps a stored choice", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "c",
      slug: "c",
    });
    const chosen = await admin.rpc.entry.update({
      id: post.id,
      access: "members",
      ifMatch: post.etag,
    });

    const renamed = await admin.rpc.entry.update({
      id: post.id,
      title: "renamed",
      ifMatch: chosen.etag,
    });

    expect(renamed.meta[ACCESS_POLICY_META_KEY]).toBe("members");
  });

  test("refuses a policy key its type does not declare", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "d",
      slug: "d",
    });

    const update = admin.rpc.entry.update({
      id: post.id,
      access: "ghost",
      ifMatch: post.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "access_policy_undeclared" },
    });
  });

  test("refuses any choice when its type declares no access space", async () => {
    const admin = site.actingAs("admin");
    const page = await admin.rpc.entry.create({
      type: "page",
      title: "e",
      slug: "e",
    });

    const update = admin.rpc.entry.update({
      id: page.id,
      access: "members",
      ifMatch: page.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "access_policy_undeclared" },
    });
  });

  test("can't be smuggled in through the meta bag under its reserved key", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "f",
      slug: "f",
    });

    const update = admin.rpc.entry.update({
      id: post.id,
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
      ifMatch: post.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered" },
    });
  });
});
