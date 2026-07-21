import { describe, expect, test } from "vitest";

import {
  decodeRevisionMessage,
  decodeSnapshotEnvelope,
  encodeSnapshotEnvelope,
  REVISION_MESSAGE_META_KEY,
  SNAPSHOT_META_KEY,
  stripReservedMeta,
} from "./snapshot-envelope.js";

describe("snapshot envelope codec", () => {
  test("round-trips slug + parentId through encode → decode", () => {
    const encoded = encodeSnapshotEnvelope({
      slug: "hello-world",
      parentId: 42,
    });
    expect(decodeSnapshotEnvelope(encoded)).toEqual({
      slug: "hello-world",
      parentId: 42,
    });
  });
});

describe("stripReservedMeta", () => {
  test("drops framework-reserved __plumix_* keys, keeps user meta", () => {
    const stripped = stripReservedMeta({
      seoTitle: "Hello",
      ogImage: "/a.png",
      [SNAPSHOT_META_KEY]: { slug: "hello", parentId: null },
      [REVISION_MESSAGE_META_KEY]: "before redesign",
    });

    expect(stripped).toEqual({ seoTitle: "Hello", ogImage: "/a.png" });
  });

  test("returns an empty object when only reserved keys are present", () => {
    expect(
      stripReservedMeta({ [SNAPSHOT_META_KEY]: { slug: "x", parentId: null } }),
    ).toEqual({});
  });

  test("keeps reserved keys named in the exemption list", () => {
    const stripped = stripReservedMeta(
      {
        seoTitle: "Hello",
        __plumix_template: "landing",
        [SNAPSHOT_META_KEY]: { slug: "x", parentId: null },
      },
      ["__plumix_template"],
    );
    expect(stripped).toEqual({
      seoTitle: "Hello",
      __plumix_template: "landing",
    });
  });
});

describe("revision message decoder", () => {
  test("returns null when the meta has no message key", () => {
    expect(decodeRevisionMessage({})).toBeNull();
  });

  test("returns null when the message is an empty string", () => {
    expect(
      decodeRevisionMessage({ [REVISION_MESSAGE_META_KEY]: "" }),
    ).toBeNull();
  });

  test("returns null when the meta key is not a string", () => {
    expect(
      decodeRevisionMessage({ [REVISION_MESSAGE_META_KEY]: 42 }),
    ).toBeNull();
  });

  test("returns the string when set", () => {
    expect(
      decodeRevisionMessage({
        [REVISION_MESSAGE_META_KEY]: "before the redesign",
      }),
    ).toBe("before the redesign");
  });
});
