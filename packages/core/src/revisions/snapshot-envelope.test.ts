import { describe, expect, test } from "vitest";

import {
  decodeSnapshotEnvelope,
  encodeSnapshotEnvelope,
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
