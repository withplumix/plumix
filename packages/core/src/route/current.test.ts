import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { isCurrentSource } from "./current.js";

function ctxWith(
  resolvedEntity: AppContext["resolvedEntity"],
  url = "https://cms.example/about",
): AppContext {
  return {
    request: new Request(url),
    resolvedEntity,
  } as unknown as AppContext;
}

describe("isCurrentSource", () => {
  describe("entry kind", () => {
    test("matches when ctx.resolvedEntity is the same entry id", () => {
      const ctx = ctxWith({ kind: "entry", id: 42 });
      expect(isCurrentSource(ctx, { kind: "entry", id: 42 })).toBe(true);
    });

    test("does not match a different entry id", () => {
      const ctx = ctxWith({ kind: "entry", id: 42 });
      expect(isCurrentSource(ctx, { kind: "entry", id: 99 })).toBe(false);
    });

    test("does not match across kinds (term id matching entry id is a different entity)", () => {
      const ctx = ctxWith({ kind: "term", id: 42 });
      expect(isCurrentSource(ctx, { kind: "entry", id: 42 })).toBe(false);
    });

    test("does not match an archive resolvedEntity", () => {
      const ctx = ctxWith({ kind: "archive", entryType: "post" });
      expect(isCurrentSource(ctx, { kind: "entry", id: 1 })).toBe(false);
    });

    test("returns false when ctx.resolvedEntity is null", () => {
      const ctx = ctxWith(null);
      expect(isCurrentSource(ctx, { kind: "entry", id: 1 })).toBe(false);
    });
  });

  describe("term kind", () => {
    test("matches when ctx.resolvedEntity is the same term id", () => {
      const ctx = ctxWith({ kind: "term", id: 7 });
      expect(isCurrentSource(ctx, { kind: "term", id: 7 })).toBe(true);
    });

    test("does not cross-match entry id", () => {
      const ctx = ctxWith({ kind: "entry", id: 7 });
      expect(isCurrentSource(ctx, { kind: "term", id: 7 })).toBe(false);
    });
  });

  describe("custom kind", () => {
    test("matches identical pathname", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about" })).toBe(
        true,
      );
    });

    test("trailing-slash insensitive — request has trailing, source doesn't", () => {
      const ctx = ctxWith(null, "https://cms.example/about/");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about" })).toBe(
        true,
      );
    });

    test("trailing-slash insensitive — source has trailing, request doesn't", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about/" })).toBe(
        true,
      );
    });

    test("ignores query string (path-equality semantics)", () => {
      const ctx = ctxWith(null, "https://cms.example/about?utm=foo");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about" })).toBe(
        true,
      );
    });

    test("ignores fragment", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about#top" })).toBe(
        true,
      );
    });

    test("does not match a different pathname", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/contact" })).toBe(
        false,
      );
    });

    test("absolute source URL with same pathname matches", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(
        isCurrentSource(ctx, {
          kind: "custom",
          url: "https://cms.example/about",
        }),
      ).toBe(true);
    });

    test("cross-origin source URL never matches (external link is not current)", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(
        isCurrentSource(ctx, {
          kind: "custom",
          url: "https://other.example/about",
        }),
      ).toBe(false);
    });

    test("malformed source url returns false (graceful degradation)", () => {
      const ctx = ctxWith(null, "https://cms.example/about");
      expect(isCurrentSource(ctx, { kind: "custom", url: "::not a url" })).toBe(
        false,
      );
    });

    test("ignores resolvedEntity for custom-URL items (URL-only check)", () => {
      const ctx = ctxWith(
        { kind: "entry", id: 99 },
        "https://cms.example/contact",
      );
      expect(isCurrentSource(ctx, { kind: "custom", url: "/contact" })).toBe(
        true,
      );
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about" })).toBe(
        false,
      );
    });
  });

  describe("root path edge cases", () => {
    test("matches `/` exactly", () => {
      const ctx = ctxWith(null, "https://cms.example/");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/" })).toBe(true);
    });

    test("`/` does not normalize away to empty", () => {
      const ctx = ctxWith(null, "https://cms.example/");
      expect(isCurrentSource(ctx, { kind: "custom", url: "/about" })).toBe(
        false,
      );
    });
  });
});
