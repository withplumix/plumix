import { describe, expect, expectTypeOf, test } from "vitest";

import type { GenericTier, TemplateData, TierMatchRule } from "../../theme.js";
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
  kind: "entry",
  entryType: "post",
  slug: "hello",
  databaseId: 42,
};

describe("resolveRule — a non-template rule kind", () => {
  test("walks targeted, then the node's tier, then fallback, then nothing", () => {
    const targeted = card("targeted", {
      match: { nodeKind: "entry", type: "post" },
    });
    const tier = card("tier", { tier: "entry" });
    const universal = card("fallback", { tier: "fallback" });
    // An "entryType" tier is unreachable from an entry node at every step.
    const unreachable = card("entryType", { tier: "entryType" });

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
      match: { nodeKind: "entry", type: "post" },
    });
    const narrow = card("narrow", {
      match: { nodeKind: "entry", type: "post", slug: "hello" },
    });
    const miss = card("miss", {
      match: { nodeKind: "entry", type: "post", slug: "other" },
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
          nodeKind: "entry",
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

describe("resolveRule — a node's generic tier", () => {
  const nodes: readonly ResolvedNode[] = [
    { kind: "entry", entryType: "post", slug: "hello", databaseId: 42 },
    { kind: "entryType", entryType: "post" },
    { kind: "term", taxonomy: "tag", slug: "news", databaseId: 3 },
    { kind: "author", slug: "ada", databaseId: 7 },
    { kind: "date", year: 2026, month: null, day: null },
    { kind: "frontPage" },
    { kind: "search" },
  ];

  test.each(nodes)(
    "a $kind node is served by the tier of the same name",
    (node) => {
      const rules = [
        card("fallback", { tier: "fallback" }),
        card(node.kind, { tier: node.kind as GenericTier }),
      ];
      expect(resolveRule(rules, node)?.cardKey).toBe(node.kind);
    },
  );

  test("an archiveType node has no generic tier and falls back", () => {
    const rules = [card("fallback", { tier: "fallback" })];
    expect(
      resolveRule(rules, { kind: "archiveType", name: "events" })?.cardKey,
    ).toBe("fallback");
  });
});
