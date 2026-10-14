import type { ConnectedObjectStorage } from "plumix/runtime";
import type { DispatcherHarness } from "plumix/test";
import { memoryStorage } from "plumix/runtime";
import { beforeEach, describe, expect, test } from "vitest";

import { createHarness } from "./test/harness.js";

let storage: ConnectedObjectStorage;
let harness: DispatcherHarness;

beforeEach(async () => {
  storage = memoryStorage().connect({});
  await storage.put("og/entry/1/abc.png", "card");
  await storage.put("og/front-page/def.png", "card");
  await storage.put("media/2026/photo.png", "photo");
  harness = await createHarness({ storage });
});

async function settle(scopes: readonly string[]): Promise<Response> {
  const admin = await harness.seedUser("admin");
  const { secret } = await harness.factory.apiToken.create({
    userId: admin.id,
  });
  return harness.dispatch(
    new Request("https://cms.example/_plumix/api/v1/system/sync/settle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ scopes, direction: "pull" }),
    }),
  );
}

async function storedKeys(): Promise<string[]> {
  return (await storage.list()).items.map((item) => item.key).sort();
}

describe("og() after a sync", () => {
  test("a sync that replaced content deletes every stored card and nothing else", async () => {
    const response = await settle(["content"]);

    expect(await response.json()).toEqual({ cdn: "none", failures: [] });
    expect(await storedKeys()).toEqual(["media/2026/photo.png"]);
  });

  test("a sync that left content alone keeps the stored cards", async () => {
    await settle(["media"]);

    expect(await storedKeys()).toEqual([
      "media/2026/photo.png",
      "og/entry/1/abc.png",
      "og/front-page/def.png",
    ]);
  });
});
