import { describe, expect, it } from "vitest";

import { createRequestMemo } from "../../context/memo.js";
import { declaredPageTags, declarePageTags } from "./page-tags.js";

// The accumulator keys off `ctx.memo`, so each fake context needs its own
// memo to stand in for a distinct request.
function fakeCtx() {
  return { memo: createRequestMemo() };
}

describe("page-tags accumulator", () => {
  it("reads nothing before anything is declared", () => {
    expect(declaredPageTags(fakeCtx())).toEqual([]);
  });

  it("collects tags across calls, de-duplicated", () => {
    const ctx = fakeCtx();
    declarePageTags(ctx, ["e:1", "e:2"]);
    declarePageTags(ctx, ["e:2", "e:3"]);
    expect(declaredPageTags(ctx)).toEqual(["e:1", "e:2", "e:3"]);
  });

  it("ignores an empty tag list", () => {
    const ctx = fakeCtx();
    declarePageTags(ctx, []);
    expect(declaredPageTags(ctx)).toEqual([]);
  });

  it("lower-cases a declared tag", () => {
    const ctx = fakeCtx();
    declarePageTags(ctx, ["t:Post"]);
    expect(declaredPageTags(ctx)).toEqual(["t:post"]);
  });

  it("scopes tags to the declaring request", () => {
    const a = fakeCtx();
    const b = fakeCtx();
    declarePageTags(a, ["e:1"]);
    expect(declaredPageTags(b)).toEqual([]);
  });

  it("reaches the same set from a derived context", () => {
    // `withUser`, the base-path strip and the formPost session swap all
    // spread the context into a fresh object that shares the memo — tags
    // declared before or after the derivation read back through either.
    const ctx = fakeCtx();
    const derived = { ...ctx, request: new Request("https://cms.example/") };
    declarePageTags(derived, ["e:1"]);
    expect(declaredPageTags(ctx)).toEqual(["e:1"]);
  });
});
