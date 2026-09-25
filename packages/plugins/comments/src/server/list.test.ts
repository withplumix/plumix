import { describe, expect, test } from "vitest";

import type { Harness } from "../test/harness.js";
import { commentFactory } from "../test/factories.js";
import {
  gatedBlog,
  harnessWith,
  REVISION_TYPES_ENABLED,
  seedPost,
  seedRevision,
} from "../test/harness.js";

async function seedRoots(harness: Harness, entryId: number, n: number) {
  const f = commentFactory.transient({ db: harness.db });
  const made = [];
  for (let i = 1; i <= n; i++) {
    made.push(
      await f.create({
        entryId,
        status: "approved",
        bodyMd: `root ${String(i)}`,
        createdAt: new Date(`2026-06-${String(i).padStart(2, "0")}T00:00:00Z`),
      }),
    );
  }
  return made;
}

interface ListPage {
  comments: { id: number; bodyHtml: string; replies: { bodyHtml: string }[] }[];
  hasMore: boolean;
  nextCursor: string | null;
}

describe("GET /_plumix/comments/list", () => {
  test("rejects a missing or invalid entryId", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    (await harness.fetch("/_plumix/comments/list")).assertStatus(400);
    (await harness.fetch("/_plumix/comments/list?entryId=0")).assertStatus(400);
  });

  test("404s for a non-published entry", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    const draft = await seedPost(harness, { status: "draft" });
    (
      await harness.fetch(`/_plumix/comments/list?entryId=${String(draft.id)}`)
    ).assertStatus(404);
  });

  test("404s for a published revision row's id", async () => {
    const harness = await harnessWith({ entryTypes: REVISION_TYPES_ENABLED });
    const revision = await seedRevision(harness, await seedPost(harness));
    await seedRoots(harness, revision.id, 1);

    const res = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(revision.id)}`,
    );
    res.assertStatus(404);
    expect(await res.json()).toEqual({ error: "entry_not_found" });
  });

  test("403s when the entry type has comments disabled", async () => {
    const harness = await harnessWith({});
    const entry = await seedPost(harness);
    (
      await harness.fetch(`/_plumix/comments/list?entryId=${String(entry.id)}`)
    ).assertStatus(403);
  });

  test("404s for an entry whose type gates anonymous readers", async () => {
    // This route is `auth: "public"` — the dispatcher answers it ahead of the
    // access gate, so the entry page's own policy has to be asked here or a
    // members-only discussion is readable by anyone who knows the entry id.
    const harness = await harnessWith(
      { entryTypes: ["post"] },
      { blog: gatedBlog },
    );
    const entry = await seedPost(harness);
    await seedRoots(harness, entry.id, 1);

    (
      await harness.fetch(`/_plumix/comments/list?entryId=${String(entry.id)}`)
    ).assertStatus(404);
  });

  test("returns the next, older page of roots with their descendants", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      rootsPerPage: 2,
    });
    const entry = await seedPost(harness);
    const [oldest] = await seedRoots(harness, entry.id, 3);
    await commentFactory.transient({ db: harness.db }).create({
      entryId: entry.id,
      status: "approved",
      parentId: oldest?.id,
      bodyMd: "reply to oldest",
    });

    const firstRes = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}`,
    );
    firstRes.assertStatus(200);
    const first = await firstRes.json<ListPage>();
    expect(first.comments).toHaveLength(2);
    expect(first.comments[0]?.bodyHtml).toContain("root 3");
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const secondRes = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}&cursor=${String(
        first.nextCursor,
      )}`,
    );
    const second = await secondRes.json<ListPage>();
    expect(second.comments).toHaveLength(1);
    expect(second.comments[0]?.bodyHtml).toContain("root 1");
    expect(second.comments[0]?.replies[0]?.bodyHtml).toContain(
      "reply to oldest",
    );
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  test("never leaks author email or ip hash in the payload", async () => {
    const harness = await harnessWith({ entryTypes: ["post"] });
    const entry = await seedPost(harness);
    await commentFactory.transient({ db: harness.db }).create({
      entryId: entry.id,
      status: "approved",
      authorEmail: "secret@example.test",
      ipHash: "deadbeef",
    });

    const res = await harness.fetch(
      `/_plumix/comments/list?entryId=${String(entry.id)}`,
    );
    const body = await res.text();
    expect(body).not.toContain("secret@example.test");
    expect(body).not.toContain("deadbeef");
  });
});
