import { describe, expect, expectTypeOf, test } from "vitest";

import type { TemplateData, TierMatchRule } from "../../theme.js";
import type { ResolvedNode } from "./rule-resolver.js";
import { resolveErrorRule, resolveRule } from "./rule-resolver.js";

// A second rule kind: the same tier/matcher vocabulary the template rules use,
// over a payload that is not a React component. `template-hierarchy.test.ts`
// covers the walk itself at `TemplateRule`; what is asserted here is that the
// payload stays out of it — precedence, and the rule that comes back.
interface CardRule extends TierMatchRule {
  readonly cardKey: string;
}

const card = (cardKey: string, rule: TierMatchRule): CardRule => ({
  ...rule,
  cardKey,
});

const postNode: ResolvedNode = {
  kind: "content",
  entryType: "post",
  slug: "hello",
  databaseId: 42,
};

describe("resolveRule — a non-template rule kind", () => {
  test("walks targeted, then the node's tier, then fallback, then nothing", () => {
    const targeted = card("targeted", {
      match: { nodeKind: "content", type: "post" },
    });
    const tier = card("tier", { tier: "entry" });
    const universal = card("fallback", { tier: "fallback" });
    // An "archive" tier is unreachable from a content node at every step.
    const unreachable = card("archive", { tier: "archive" });

    expect(
      resolveRule([unreachable, universal, tier, targeted], postNode)?.cardKey,
    ).toBe("targeted");
    expect(resolveRule([unreachable, universal, tier], postNode)?.cardKey).toBe(
      "tier",
    );
    expect(resolveRule([unreachable, universal], postNode)?.cardKey).toBe(
      "fallback",
    );
    expect(resolveRule([unreachable], postNode)).toBeUndefined();
  });

  test("first matching targeted rule wins, and a miss falls through to the tier", () => {
    const broad = card("broad", {
      match: { nodeKind: "content", type: "post" },
    });
    const narrow = card("narrow", {
      match: { nodeKind: "content", type: "post", slug: "hello" },
    });
    const miss = card("miss", {
      match: { nodeKind: "content", type: "post", slug: "other" },
    });
    expect(resolveRule([broad, narrow], postNode)).toBe(broad);
    expect(resolveRule([narrow, broad], postNode)).toBe(narrow);
    expect(
      resolveRule([miss, card("generic", { tier: "entry" })], postNode)
        ?.cardKey,
    ).toBe("generic");
  });

  test("a predicate narrows the match, and needs the resolved data to fire", () => {
    const rules = [
      card("featured", {
        match: {
          nodeKind: "content",
          type: "post",
          predicate: (data) => data.kind === "entry",
        },
      }),
      card("generic", { tier: "entry" }),
    ];
    const data = { kind: "entry" } as TemplateData;
    expect(resolveRule(rules, postNode, data)?.cardKey).toBe("featured");
    // Without data a predicate rule can never match.
    expect(resolveRule(rules, postNode)?.cardKey).toBe("generic");
  });

  test("resolveErrorRule finds the error tiers", () => {
    const rules = [
      card("404", { tier: "notFound" }),
      card("500", { tier: "serverError" }),
    ];
    expect(resolveErrorRule(rules, "notFound")?.cardKey).toBe("404");
    expect(resolveErrorRule(rules, "serverError")?.cardKey).toBe("500");
    expect(resolveErrorRule([], "notFound")).toBeUndefined();
  });

  test("the resolved rule keeps its own payload type", () => {
    const rules = [card("f", { tier: "fallback" })];
    expectTypeOf(resolveRule(rules, postNode)).toEqualTypeOf<
      CardRule | undefined
    >();
    expectTypeOf(resolveErrorRule(rules, "notFound")).toEqualTypeOf<
      CardRule | undefined
    >();
  });
});
