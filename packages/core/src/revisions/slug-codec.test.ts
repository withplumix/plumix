import { describe, expect, test } from "vitest";

import {
  buildRevisionSlug,
  decodeRevisionSlug,
  isRevisionType,
  REVISION_TYPE,
} from "./slug-codec.js";

describe("revision slug codec", () => {
  test("buildRevisionSlug composes `revision:<entryId>:<nanoid>` from inputs", () => {
    expect(buildRevisionSlug({ entryId: 42, nanoid: "abc123def456" })).toBe(
      "revision:42:abc123def456",
    );
  });

  test("decodeRevisionSlug recovers entryId + nanoid from a built slug", () => {
    const slug = buildRevisionSlug({ entryId: 7, nanoid: "xyz" });
    expect(decodeRevisionSlug(slug)).toEqual({ entryId: 7, nanoid: "xyz" });
  });

  test("decodeRevisionSlug returns undefined for non-revision slugs", () => {
    expect(decodeRevisionSlug("hello-world")).toBeUndefined();
    expect(decodeRevisionSlug("revision:")).toBeUndefined();
    expect(decodeRevisionSlug("revision:abc:def")).toBeUndefined();
    expect(decodeRevisionSlug("revision:42")).toBeUndefined();
    expect(decodeRevisionSlug("revision:42:")).toBeUndefined();
  });

  test("isRevisionType discriminates reserved type from public ones", () => {
    expect(isRevisionType(REVISION_TYPE)).toBe(true);
    expect(isRevisionType("post")).toBe(false);
    expect(isRevisionType("Revision")).toBe(false);
    expect(isRevisionType(undefined)).toBe(false);
  });
});
