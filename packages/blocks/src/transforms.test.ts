import { describe, expect, test } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "./types.js";
import { resolveTransformTargets } from "./transforms.js";

function spec(
  partial: Partial<ResolvedBlockSpec> & { name: string; title: string },
): ResolvedBlockSpec {
  const out: Partial<ResolvedBlockSpec> = {
    name: partial.name,
    title: partial.title,
    component: () => null,
    registeredBy: null,
    transforms: partial.transforms,
  };
  return out as ResolvedBlockSpec;
}

function fakeRegistry(specs: readonly ResolvedBlockSpec[]): BlockRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies BlockRegistry;
}

describe("resolveTransformTargets", () => {
  test("returns transforms.to entries when source declares them", () => {
    const heading = spec({ name: "core/heading", title: "Heading" });
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: { to: [{ target: "core/heading" }] },
    });
    const registry = fakeRegistry([paragraph, heading]);
    const targets = resolveTransformTargets("core/paragraph", registry);
    expect(targets.map((t) => t.target)).toEqual(["core/heading"]);
  });

  test("includes targets discovered through other blocks' transforms.from", () => {
    const heading = spec({
      name: "core/heading",
      title: "Heading",
      transforms: { from: [{ source: "core/paragraph" }] },
    });
    const paragraph = spec({ name: "core/paragraph", title: "Paragraph" });
    const registry = fakeRegistry([paragraph, heading]);
    const targets = resolveTransformTargets("core/paragraph", registry);
    expect(targets.map((t) => t.target)).toEqual(["core/heading"]);
  });

  test("dedupes by target name and orders by priority desc", () => {
    const heading = spec({
      name: "core/heading",
      title: "Heading",
      transforms: { priority: 10, from: [{ source: "core/paragraph" }] },
    });
    const quote = spec({
      name: "core/quote",
      title: "Quote",
      transforms: { priority: 5, from: [{ source: "core/paragraph" }] },
    });
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: {
        priority: 100,
        to: [{ target: "core/heading" }, { target: "core/quote" }],
      },
    });
    const registry = fakeRegistry([paragraph, heading, quote]);
    const names = resolveTransformTargets("core/paragraph", registry).map(
      (t) => t.target,
    );
    // higher priority wins on dedupe: paragraph.priority=100 entries
    // first, then by target name (stable)
    expect(names).toEqual(["core/heading", "core/quote"]);
  });

  test("returns [] when the source spec has no transforms and no other block points to it", () => {
    const paragraph = spec({ name: "core/paragraph", title: "Paragraph" });
    const registry = fakeRegistry([paragraph]);
    expect(resolveTransformTargets("core/paragraph", registry)).toEqual([]);
  });

  test("skips targets that no longer exist in the registry", () => {
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: { to: [{ target: "core/missing-from-registry" }] },
    });
    const registry = fakeRegistry([paragraph]);
    expect(
      resolveTransformTargets("core/paragraph", registry).map((t) => t.target),
    ).toEqual([]);
  });

  test("returns [] for unknown source name", () => {
    const paragraph = spec({ name: "core/paragraph", title: "Paragraph" });
    const registry = fakeRegistry([paragraph]);
    expect(resolveTransformTargets("core/unknown", registry)).toEqual([]);
  });

  test("from-side beats to-side when its priority is higher", () => {
    // paragraph declares heading at priority 1; heading declares
    // accepts-paragraph at priority 99 with its own mapAttrs. The
    // higher-priority side's entry survives the dedupe.
    const headingMapper = () => ({ level: 9 });
    const paragraphMapper = () => ({ level: 2 });
    const heading = spec({
      name: "core/heading",
      title: "Heading",
      transforms: {
        priority: 99,
        from: [{ source: "core/paragraph", mapAttrs: headingMapper }],
      },
    });
    const paragraph = spec({
      name: "core/paragraph",
      title: "Paragraph",
      transforms: {
        priority: 1,
        to: [{ target: "core/heading", mapAttrs: paragraphMapper }],
      },
    });
    const registry = fakeRegistry([paragraph, heading]);
    const targets = resolveTransformTargets("core/paragraph", registry);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.target).toBe("core/heading");
    // The from-side entry is the synthesized `{ target: candidate.name }`
    // without mapAttrs (the spec author's mapAttrs lives on the
    // candidate's `transforms.from[i].mapAttrs`, which the resolver
    // would have to carry through to surface it). For this slice the
    // synthesized entry is `{ target }` only — assert that the
    // priority-winning side replaced the to-side's `paragraphMapper`.
    expect(targets[0]?.mapAttrs).not.toBe(paragraphMapper);
  });
});
