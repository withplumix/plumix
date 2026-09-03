import { describe, expect, test } from "vitest";

import type { Harness } from "../test/harness.js";
import { harnessWith, rows, seedPost } from "../test/harness.js";

function submit(
  harness: Harness,
  entryId: number,
  body: Record<string, unknown> = {},
  /** Whose request this is, as the runtime reports it. */
  clientAddress?: string,
) {
  return harness.fetch("/_plumix/comments/submit", {
    method: "POST",
    clientAddress,
    json: {
      entryId,
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
      ...body,
    },
  });
}

/** Two visitors of one install, told apart by the address each request carries. */
const FLOODER = "203.0.113.7";
const BYSTANDER = "198.51.100.9";

describe("POST /_plumix/comments/submit", () => {
  test("auto-approves under mode 'none' and persists the comment", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    res.assertStatus(200);
    expect(await res.json()).toEqual({ status: "approved" });
    const stored = await rows(harness);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("approved");
    expect(stored[0]?.bodyMd).toBe("hello world");
  });

  test("holds a new email as pending under 'first_time'", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "first_time",
    });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    expect(await res.json()).toEqual({ status: "pending" });
  });

  test("honeypot submissions fake success and are not stored", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id, {
      website: "http://spam.example",
    });

    res.assertStatus(200);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("rejects comments on a non-enabled entry type", async () => {
    const harness = await harnessWith({ mode: "none" }); // post not enabled
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    res.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("rejects a missing email when requireEmail is on", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id, { email: "" });

    res.assertStatus(400);
  });

  test("rate-limits a flood from one address", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 2, windowMin: 10 },
    });
    const entry = await seedPost(harness);

    await submit(harness, entry.id, {}, FLOODER);
    await submit(harness, entry.id, {}, FLOODER);
    const third = await submit(harness, entry.id, {}, FLOODER);

    third.assertStatus(429);
    expect(await rows(harness)).toHaveLength(2);
  });

  test("one address's flood does not refuse another address", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 2, windowMin: 10 },
    });
    const entry = await seedPost(harness);
    await submit(harness, entry.id, {}, FLOODER);
    await submit(harness, entry.id, {}, FLOODER);
    (await submit(harness, entry.id, {}, FLOODER)).assertStatus(429);

    const bystander = await submit(harness, entry.id, {}, BYSTANDER);

    bystander.assertStatus(200);
    expect(await rows(harness)).toHaveLength(3);
  });

  test("a comment:moderate filter can demote to spam", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    harness.spyFilter("comment:moderate").override(() => "spam");
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    expect(await res.json()).toEqual({ status: "spam" });
  });

  test("fires comment:created with the stored row", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const spy = harness.spyAction("comment:created");
    const entry = await seedPost(harness);

    await submit(harness, entry.id);

    spy.assertCalledOnce();
  });

  test("stores a salted ip hash, never the cleartext ip", async () => {
    const harness = await harnessWith(
      { entryTypes: ["post"], mode: "none" },
      { clientAddress: "203.0.113.7" },
    );
    const entry = await seedPost(harness);

    await submit(harness, entry.id);

    const stored = await rows(harness);
    expect(stored[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored[0])).not.toContain("203.0.113.7");
  });

  test("stores a reply under its parent", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);
    await submit(harness, entry.id, { body: "root" });
    const root = (await rows(harness)).find((c) => c.bodyMd === "root");

    const res = await submit(harness, entry.id, {
      body: "reply",
      parentId: root?.id,
    });

    res.assertStatus(200);
    const reply = (await rows(harness)).find((c) => c.bodyMd === "reply");
    expect(reply?.parentId).toBe(root?.id);
  });

  test("clamps a reply that would exceed maxDepth", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      maxDepth: 1,
    });
    const entry = await seedPost(harness);
    await submit(harness, entry.id, { body: "root" });
    const root = (await rows(harness)).find((c) => c.bodyMd === "root");
    await submit(harness, entry.id, { body: "d1", parentId: root?.id });
    const d1 = (await rows(harness)).find((c) => c.bodyMd === "d1");

    // depth-1 cap: a reply to the depth-1 comment clamps back to the root.
    await submit(harness, entry.id, { body: "d2", parentId: d1?.id });
    const d2 = (await rows(harness)).find((c) => c.bodyMd === "d2");
    expect(d2?.parentId).toBe(root?.id);
  });
});
