import type { LookupResult } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { mapItemState } from "./item-state.js";

const customMeta = { kind: "custom" as const, url: "/" };
const entryMeta = { kind: "entry" as const, entryId: 42 };
const termMeta = { kind: "term" as const, termId: 7 };
const lookup: LookupResult = {
  id: "42",
  label: "About",
  cached: { href: "/about" },
};

describe("mapItemState", () => {
  test("custom items are always ok regardless of lookup or capability", () => {
    // Custom URL items don't reference an entity, so resolution and
    // capability gates don't apply — they always render normally.
    expect(
      mapItemState({
        meta: customMeta,
        lookupResult: null,
        canAccessKind: () => false,
      }),
    ).toBe("ok");
  });

  test("entry/term items with a successful lookup are ok", () => {
    expect(
      mapItemState({
        meta: entryMeta,
        lookupResult: lookup,
        canAccessKind: () => true,
      }),
    ).toBe("ok");
  });

  test("entry/term items return broken when lookup is null", () => {
    // Resolver returns null when the linked entry was trashed or the
    // term was deleted. Admin keeps the item visible with a warning.
    expect(
      mapItemState({
        meta: entryMeta,
        lookupResult: null,
        canAccessKind: () => true,
      }),
    ).toBe("broken");
  });

  test("entry/term items return unauthorized when the viewer can't access the kind", () => {
    // Some adapters gate `list`/`resolve` behind a capability so lower-
    // privilege roles can't enumerate them. The admin still surfaces
    // these items but greys them out and disables destructive actions.
    expect(
      mapItemState({
        meta: termMeta,
        lookupResult: null,
        canAccessKind: () => false,
      }),
    ).toBe("unauthorized");
  });

  test("unauthorized state is set without a lookup result (server is expected to skip the call)", () => {
    // Resolver should NOT call the adapter for kinds the viewer can't
    // access — that would round-trip data the response then leaks via
    // `resolved.label`. mapItemState handles the post-skip case where
    // lookupResult is null and canAccessKind is false: unauthorized.
    expect(
      mapItemState({
        meta: termMeta,
        lookupResult: null,
        canAccessKind: () => false,
      }),
    ).toBe("unauthorized");
  });

  test("unauthorized takes precedence over a present lookup result", () => {
    // Defense in depth: even if a lookup happened to return a value
    // for an unauthorized kind, the admin should still treat it as
    // unauthorized rather than leaking the resolved label.
    expect(
      mapItemState({
        meta: entryMeta,
        lookupResult: lookup,
        canAccessKind: () => false,
      }),
    ).toBe("unauthorized");
  });
});
