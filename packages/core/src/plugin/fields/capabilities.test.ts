import { describe, expect, test } from "vitest";

import type {
  AssertNoMissingCapabilities,
  BuilderName,
} from "./capabilities.js";
import {
  BUILDER_CAPABILITIES,
  CAPABILITY_CAVEATS,
  CAPABILITY_EXCEPTIONS,
  CROSS_CUTTING_CAPABILITIES,
  UNIVERSAL_CAPABILITIES,
} from "./capabilities.js";
import {
  color,
  date,
  entry,
  group,
  json,
  link,
  number,
  range,
  repeater,
  richtext,
  select,
  text,
  toggle,
} from "./index.js";

// The matrix is a claim about the builders, so the suite checks the claim
// against the chains themselves rather than restating it. A capability a
// builder gained without its row saying so fails just as loudly as one its
// row claims and the chain lacks — drift in either direction is the bug
// this file exists to catch.

// One representative chain per builder, at the point where the whole chain
// is reachable (the seeded builders need their schema declared first).
const CHAINS = {
  string: text("t"),
  number: number("n"),
  temporal: date("d"),
  color: color("c"),
  range: range("r").bounds(0, 10),
  json: json("j"),
  richtext: richtext("body"),
  link: link("cta"),
  select: select("s").options(["a", "b"]),
  toggle: toggle("flag"),
  reference: entry("related", ["post"]),
  group: group("g").fields([text("m")]),
  repeater: repeater("rows").fields([text("m")]),
} as const;

const has = (chain: object, method: string): boolean =>
  typeof (chain as Record<string, unknown>)[method] === "function";

describe("the builder capability matrix", () => {
  test("names every builder exactly once, with no stray rows", () => {
    expect(Object.keys(BUILDER_CAPABILITIES).sort()).toEqual(
      Object.keys(CHAINS).sort(),
    );
  });

  test.each(Object.keys(CHAINS))("%s carries the universal chain", (name) => {
    const chain = CHAINS[name as keyof typeof CHAINS];
    const missing = UNIVERSAL_CAPABILITIES.filter((m) => !has(chain, m));
    expect(missing).toEqual([]);
  });

  test.each(Object.keys(CHAINS))(
    "%s carries exactly the cross-cutting capabilities its row claims",
    (name) => {
      const chain = CHAINS[name as keyof typeof CHAINS];
      const actual = CROSS_CUTTING_CAPABILITIES.filter((m) => has(chain, m));
      expect([...actual].sort()).toEqual(
        [
          ...BUILDER_CAPABILITIES[name as keyof typeof BUILDER_CAPABILITIES],
        ].sort(),
      );
    },
  );

  test("every declared exception is a cell that is genuinely absent", () => {
    for (const { builder, capability } of CAPABILITY_EXCEPTIONS) {
      expect(has(CHAINS[builder], capability)).toBe(false);
    }
  });

  test("every exception carries a reason someone can read", () => {
    for (const exception of CAPABILITY_EXCEPTIONS) {
      expect(exception.reason.length).toBeGreaterThan(20);
    }
  });

  test("every caveat carries a reason someone can read", () => {
    expect(CAPABILITY_CAVEATS.length).toBeGreaterThan(0);
    for (const caveat of CAPABILITY_CAVEATS) {
      expect(caveat.reason.length).toBeGreaterThan(20);
    }
  });
});

// The guard's whole value is that it fails, so here it is failing. A row
// claiming a capability its chain does not offer leaves a non-`never`
// entry in the missing-capabilities map, and the assertion rejects it —
// which is what `pnpm typecheck` reports against the real matrix.
type DriftedRow = {
  readonly [N in BuilderName]: N extends "group" ? "searchable" : never;
};

// @ts-expect-error — `group` offers no `.searchable()`, so a row claiming it must not type-check.
type _TheGuardBites = AssertNoMissingCapabilities<DriftedRow>;
