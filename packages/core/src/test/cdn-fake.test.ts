import { describe, expect, test } from "vitest";

import { fakeCdn } from "./cdn-fake.js";
import { describeCdnContract } from "./conformance/cdn.js";

describe("fakeCdn", () => {
  describeCdnContract({
    connect: fakeCdn,
    store: true,
    purgeTags: true,
    purgeAll: true,
  });
});

function page(path: string): Request {
  return new Request(`https://cms.example${path}`);
}

describe("assertStored", () => {
  test("passes for a stored path and fails listing what is stored", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/post/hello"), new Response("hello"), []);
    await cdn.store.put(page("/feed?page=2"), new Response("feed"), []);

    cdn.assertStored("/post/hello");
    cdn.assertStored("/feed?page=2");
    expect(() => {
      cdn.assertStored("/post/other");
    }).toThrow(
      'Expected "/post/other" to be stored, but it is not.\n' +
        "Stored:\n  - /post/hello\n  - /feed?page=2",
    );
  });

  test("says nothing is stored when the store is empty", () => {
    const cdn = fakeCdn();

    expect(() => {
      cdn.assertStored("/post/hello");
    }).toThrow(
      'Expected "/post/hello" to be stored, but it is not.\nNothing is stored.',
    );
  });
});

describe("assertNotStored", () => {
  test("passes once a purge drops the path and fails listing what is stored", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/post/hello"), new Response("hello"), ["a"]);
    await cdn.store.put(page("/post/kept"), new Response("kept"), ["b"]);

    expect(() => {
      cdn.assertNotStored("/post/hello");
    }).toThrow(
      'Expected "/post/hello" not to be stored, but it is.\n' +
        "Stored:\n  - /post/hello\n  - /post/kept",
    );
    await cdn.purgeTags(["a"]);
    cdn.assertNotStored("/post/hello");
    cdn.assertStored("/post/kept");
  });
});
