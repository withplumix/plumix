import type { EntryStatus } from "plumix/schema";
import {
  CORE_CAPABILITIES,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "plumix";
import { coreBlocks, coreMarks } from "plumix/blocks";
import { describe, expect, it } from "vitest";

import type { Assert, Equals } from "./type-assert";
import { ROSTERS } from "./rosters";

// The other half of the guard, and it belongs to `pnpm typecheck` rather than
// to vitest: this is the shape every type-level binding in `rosters.ts` has,
// applied to a list one value short of its source. `@ts-expect-error` is the
// proof — the day the shape stops catching a short list is the day this
// directive goes unused and typecheck fails on it.
// @ts-expect-error -- a list short of a source value must not satisfy Equals.
type _ShortListIsCaught = Assert<Equals<"draft" | "published", EntryStatus>>;

function itemsOf(page: string): readonly string[] {
  const roster = ROSTERS.find((candidate) => candidate.page === page);
  if (roster === undefined) throw new Error(`No roster registered for ${page}`);
  return roster.items;
}

// The three rosters below are the ones whose source hides its values behind a
// widening annotation — `readonly BlockSpec[]`, `Record<string, UserRole>` —
// leaving `typeof` nothing to bind a type-level assertion to. A runtime
// comparison against the same source is the binding instead, and it is
// stricter than the type-level one: it pins order as well as membership.
describe("the rosters bound to their source at runtime", () => {
  it("binds the core-block roster to the blocks the package ships", () => {
    expect(itemsOf("blocks/core-blocks.mdx")).toEqual(
      coreBlocks.map((block) => block.name),
    );
  });

  it("binds the mark roster to the marks the package ships", () => {
    expect(itemsOf("blocks/marks.mdx")).toEqual(
      coreMarks.map((mark) => mark.name),
    );
  });

  it("binds the capability roster to the three capability records", () => {
    expect(itemsOf("access/capabilities.mdx")).toEqual([
      ...Object.keys(CORE_CAPABILITIES),
      ...Object.keys(POST_TYPE_CAPABILITY_ACTIONS).map(
        (action) => `entry:*:${action}`,
      ),
      ...Object.keys(TERM_TAXONOMY_CAPABILITY_ACTIONS).map(
        (action) => `term:*:${action}`,
      ),
    ]);
  });
});
