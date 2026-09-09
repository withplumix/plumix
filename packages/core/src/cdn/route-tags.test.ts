import { describe, expect, it } from "vitest";

import type { AppContext } from "../context/app.js";
import { createRequestMemo } from "../context/memo.js";
import { cdnTagsFor, tagCdnEntry } from "./route-tags.js";

// Only the two fields the accumulator reads: the memo it keys on, and the
// cdn slot whose absence means nothing will ever be stored.
function context(): AppContext {
  return { memo: createRequestMemo(), cdn: {} } as unknown as AppContext;
}

describe("tagCdnEntry", () => {
  it("hands the tags a handler declared to the store that follows", () => {
    const ctx = context();

    tagCdnEntry(ctx, ["e:7"]);
    tagCdnEntry(ctx, ["t:post", "e:7"]);

    expect(cdnTagsFor(ctx)).toEqual(["e:7", "t:post"]);
  });

  it("keeps one request's tags out of the next request's entry", () => {
    const first = context();
    tagCdnEntry(first, ["e:7"]);

    expect(cdnTagsFor(context())).toEqual([]);
  });

  // Core derives contexts by spreading — the base-path strip and `withUser`
  // both do. A handler handed a derived one has to reach the same accumulator,
  // or it stores untagged with nothing to say so.
  it("reaches the same entry from a derived context", () => {
    const ctx = context();
    const derived: AppContext = { ...ctx, request: new Request("https://x/") };

    tagCdnEntry(derived, ["e:7"]);

    expect(cdnTagsFor(ctx)).toEqual(["e:7"]);
  });

  it("accumulates nothing on a deploy that bound no cdn", () => {
    const ctx = { ...context(), cdn: undefined };

    tagCdnEntry(ctx, ["e:7"]);

    expect(cdnTagsFor(ctx)).toEqual([]);
  });
});
