import { describe, expect, test } from "vitest";

import {
  decodeRevisionMessage,
  decodeSnapshotEnvelope,
  encodeSnapshotEnvelope,
  REVISION_MESSAGE_META_KEY,
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
