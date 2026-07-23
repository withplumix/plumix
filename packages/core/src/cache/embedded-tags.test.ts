import { describe, expect, it } from "vitest";

import type { AppContext } from "../context/app.js";
import { accumulateEmbeddedTags, embeddedPageTags } from "./embedded-tags.js";

// The accumulator keys off `ctx.request`, so each fake context needs its
// own `Request` to stand in for a distinct per-request AppContext.
function fakeCtx(): AppContext {
  return { request: new Request("https://cms.example/") } as AppContext;
}

describe("embedded-tags accumulator", () => {
  it("reads nothing before anything is accumulated", () => {
    expect(embeddedPageTags(fakeCtx())).toEqual([]);
  });

  it("collects tags across calls, de-duplicated", () => {
    const ctx = fakeCtx();
    accumulateEmbeddedTags(ctx, ["e:1", "e:2"]);
    accumulateEmbeddedTags(ctx, ["e:2", "e:3"]);
    expect(embeddedPageTags(ctx)).toEqual(["e:1", "e:2", "e:3"]);
  });

  it("ignores an empty tag list", () => {
    const ctx = fakeCtx();
    accumulateEmbeddedTags(ctx, []);
    expect(embeddedPageTags(ctx)).toEqual([]);
  });

  it("scopes tags to the accumulating context", () => {
    const a = fakeCtx();
    const b = fakeCtx();
    accumulateEmbeddedTags(a, ["e:1"]);
    expect(embeddedPageTags(b)).toEqual([]);
  });

  it("survives a context rebind that shares the same request", () => {
    // `withUser` clones the context for sessioned public renders but shares
    // `ctx.request` by reference — tags accumulated before or after the
    // rebind must read back through either context.
    const request = new Request("https://cms.example/");
    const before = { request } as AppContext;
    const afterRebind = { request } as AppContext;
    accumulateEmbeddedTags(before, ["e:1"]);
    expect(embeddedPageTags(afterRebind)).toEqual(["e:1"]);
  });
});
