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
  test("passes for a stored path", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/feed?page=2"), new Response("feed"), []);

    expect(() => {
      cdn.assertStored("/feed?page=2");
    }).not.toThrow();
  });

  test("fails listing what is stored", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/post/hello"), new Response("hello"), []);
    await cdn.store.put(page("/feed?page=2"), new Response("feed"), []);

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
  test("passes once a purge drops the path", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/post/hello"), new Response("hello"), ["a"]);
    await cdn.purgeTags(["a"]);

    expect(() => {
      cdn.assertNotStored("/post/hello");
    }).not.toThrow();
  });

  test("fails listing what is stored", async () => {
    const cdn = fakeCdn();
    await cdn.store.put(page("/post/hello"), new Response("hello"), ["a"]);
    await cdn.store.put(page("/post/kept"), new Response("kept"), ["b"]);

    expect(() => {
      cdn.assertNotStored("/post/hello");
    }).toThrow(
      'Expected "/post/hello" not to be stored, but it is.\n' +
        "Stored:\n  - /post/hello\n  - /post/kept",
    );
  });
});

describe("assertPurged", () => {
  test("passes for a tag a purge named", async () => {
    const cdn = fakeCdn();
    await cdn.purgeTags(["t:post", "e:1"]);

    expect(() => {
      cdn.assertPurged("e:1");
    }).not.toThrow();
  });

  test("fails listing the tags that were purged", async () => {
    const cdn = fakeCdn();
    await cdn.purgeTags(["t:post", "e:1"]);
    await cdn.purgeTags(["s:general"]);

    expect(() => {
      cdn.assertPurged("e:2");
    }).toThrow(
      'Expected tag "e:2" to be purged, but it was not.\n' +
        "Purged:\n  - t:post\n  - e:1\n  - s:general",
    );
  });

  test("says nothing was purged when no purge ran", () => {
    const cdn = fakeCdn();

    expect(() => {
      cdn.assertPurged("e:1");
    }).toThrow(
      'Expected tag "e:1" to be purged, but it was not.\nNothing was purged.',
    );
  });
});

describe("assertNotPurged", () => {
  test("passes for a tag no purge named", async () => {
    const cdn = fakeCdn();
    await cdn.purgeTags(["e:1"]);

    expect(() => {
      cdn.assertNotPurged("e:2");
    }).not.toThrow();
  });

  test("fails listing the tags that were purged", async () => {
    const cdn = fakeCdn();
    await cdn.purgeTags(["t:post", "e:1"]);

    expect(() => {
      cdn.assertNotPurged("e:1");
    }).toThrow(
      'Expected tag "e:1" not to be purged, but it was.\n' +
        "Purged:\n  - t:post\n  - e:1",
    );
  });
});

describe("assertNothingPurged", () => {
  test("passes when no purge ran", () => {
    const cdn = fakeCdn();

    expect(() => {
      cdn.assertNothingPurged();
    }).not.toThrow();
  });

  test("fails listing the tags that were purged", async () => {
    const cdn = fakeCdn();
    await cdn.purgeTags(["e:1"]);

    expect(() => {
      cdn.assertNothingPurged();
    }).toThrow("Expected nothing to be purged.\nPurged:\n  - e:1");
  });

  test("fails once everything was purged", async () => {
    const cdn = fakeCdn();
    await cdn.purgeAll();

    expect(() => {
      cdn.assertNothingPurged();
    }).toThrow("Expected nothing to be purged.\nPurged everything.");
  });
});
