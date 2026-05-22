import { describe, expect, test } from "vitest";

import {
  AUTOSAVE_TYPE,
  buildAutosaveSlug,
  buildRevisionSlug,
  decodeAutosaveSlug,
  decodeRevisionSlug,
  isAutosaveType,
  isReservedType,
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

describe("autosave slug codec", () => {
  test("buildAutosaveSlug composes `autosave:<entryId>:<authorId>` from inputs", () => {
    expect(buildAutosaveSlug({ entryId: 42, authorId: 7 })).toBe(
      "autosave:42:7",
    );
  });

  test("autosave slugs are deterministic per (entry, author) pair", () => {
    // The deterministic shape is load-bearing — UNIQUE (type, slug)
    // enforces one autosave per (entry, user) without a separate
    // dedup query at write time.
    expect(buildAutosaveSlug({ entryId: 42, authorId: 7 })).toBe(
      buildAutosaveSlug({ entryId: 42, authorId: 7 }),
    );
    expect(buildAutosaveSlug({ entryId: 42, authorId: 7 })).not.toBe(
      buildAutosaveSlug({ entryId: 42, authorId: 8 }),
    );
  });

  test("decodeAutosaveSlug recovers entryId + authorId from a built slug", () => {
    const slug = buildAutosaveSlug({ entryId: 100, authorId: 5 });
    expect(decodeAutosaveSlug(slug)).toEqual({ entryId: 100, authorId: 5 });
  });

  test("decodeAutosaveSlug returns undefined for non-autosave or malformed slugs", () => {
    expect(decodeAutosaveSlug("hello-world")).toBeUndefined();
    expect(decodeAutosaveSlug("revision:42:abc")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:abc:42")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:42")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:42:")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:42:abc")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:0:7")).toBeUndefined();
    expect(decodeAutosaveSlug("autosave:42:0")).toBeUndefined();
  });

  test("isAutosaveType discriminates reserved type from public ones", () => {
    expect(isAutosaveType(AUTOSAVE_TYPE)).toBe(true);
    expect(isAutosaveType("post")).toBe(false);
    expect(isAutosaveType("revision")).toBe(false);
    expect(isAutosaveType(undefined)).toBe(false);
  });
});

describe("isReservedType", () => {
  test("returns true for both reserved types", () => {
    expect(isReservedType(REVISION_TYPE)).toBe(true);
    expect(isReservedType(AUTOSAVE_TYPE)).toBe(true);
  });

  test("returns false for public types", () => {
    expect(isReservedType("post")).toBe(false);
    expect(isReservedType("page")).toBe(false);
    expect(isReservedType("")).toBe(false);
    expect(isReservedType(undefined)).toBe(false);
  });
});
