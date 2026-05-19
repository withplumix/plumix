import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import { resolveBlockTransformsV2 } from "./transforms-v2.js";

const noopRender: BlockSpec["render"] = () => null;

function spec(name: string, transforms?: BlockSpec["transforms"]): BlockSpec {
  return { name, render: noopRender, transforms };
}

describe("resolveBlockTransformsV2", () => {
  test("returns [] for an unknown source block", () => {
    expect(resolveBlockTransformsV2("unknown/block", [])).toEqual([]);
  });

  test("resolves forward `transforms.to` targets declared by the source spec; priority defaults to 0", () => {
    const specs = [
      spec("core/heading", {
        to: [{ target: "core/paragraph" }],
      }),
      spec("core/paragraph"),
    ];

    const targets = resolveBlockTransformsV2("core/heading", specs);

    expect(targets.map((t) => t.target)).toEqual(["core/paragraph"]);
    expect(targets[0]?.priority).toBe(0);
  });

  test("resolves inverse `transforms.from` declared by other specs (symmetric inverse)", () => {
    const specs = [
      spec("core/paragraph"),
      spec("core/heading", {
        from: [{ source: "core/paragraph" }],
      }),
    ];

    const targets = resolveBlockTransformsV2("core/paragraph", specs);

    expect(targets.map((t) => t.target)).toEqual(["core/heading"]);
  });

  test("dedupes by target — inverse beats forward when its priority is higher", () => {
    const specs = [
      spec("core/quote", {
        to: [{ target: "core/paragraph" }],
        priority: 5,
      }),
      spec("core/paragraph", {
        from: [{ source: "core/quote" }],
        priority: 10,
      }),
    ];

    const targets = resolveBlockTransformsV2("core/quote", specs);

    expect(targets).toHaveLength(1);
    expect(targets[0]?.target).toBe("core/paragraph");
    expect(targets[0]?.priority).toBe(10);
  });

  test("dedupes by target — forward beats inverse when its priority is higher", () => {
    const forwardMap = (a: Readonly<Record<string, unknown>>) => ({ x: a.text });
    const specs = [
      spec("core/quote", {
        to: [{ target: "core/paragraph", mapAttrs: forwardMap }],
        priority: 50,
      }),
      spec("core/paragraph", {
        from: [{ source: "core/quote" }],
        priority: 5,
      }),
    ];

    const targets = resolveBlockTransformsV2("core/quote", specs);

    expect(targets).toHaveLength(1);
    expect(targets[0]?.target).toBe("core/paragraph");
    expect(targets[0]?.priority).toBe(50);
    expect(targets[0]?.mapAttrs).toBe(forwardMap);
  });

  test("preserves the `mode` discriminator from forward transforms.to entries", () => {
    const specs = [
      spec("core/paragraph", {
        to: [{ target: "core/list", mode: "wrap" }],
      }),
      spec("core/list"),
    ];

    const targets = resolveBlockTransformsV2("core/paragraph", specs);

    expect(targets[0]?.mode).toBe("wrap");
  });

  test("filters out targets that are not in the specs list", () => {
    const specs = [
      spec("core/heading", {
        to: [
          { target: "core/paragraph" },
          { target: "core/missing" },
        ],
      }),
      spec("core/paragraph"),
    ];

    const targets = resolveBlockTransformsV2("core/heading", specs);

    expect(targets.map((t) => t.target)).toEqual(["core/paragraph"]);
  });

  test("sorts targets by descending priority", () => {
    const specs = [
      spec("core/heading", {
        to: [
          { target: "core/paragraph" },
          { target: "core/quote" },
        ],
        priority: 5,
      }),
      spec("core/paragraph"),
      spec("core/quote", {
        from: [{ source: "core/heading" }],
        priority: 50,
      }),
    ];

    const targets = resolveBlockTransformsV2("core/heading", specs);

    expect(targets.map((t) => t.target)).toEqual([
      "core/quote",
      "core/paragraph",
    ]);
  });

  test("forwards the mapAttrs function through both forward and inverse paths", () => {
    const forwardMap = (a: Readonly<Record<string, unknown>>) => ({ x: a.x });
    const inverseMap = (a: Readonly<Record<string, unknown>>) => ({ y: a.x });
    const specs = [
      spec("core/heading", {
        to: [{ target: "core/paragraph", mapAttrs: forwardMap }],
      }),
      spec("core/paragraph"),
      spec("core/quote", {
        from: [{ source: "core/heading", mapAttrs: inverseMap }],
      }),
    ];

    const targets = resolveBlockTransformsV2("core/heading", specs);

    const para = targets.find((t) => t.target === "core/paragraph");
    const quote = targets.find((t) => t.target === "core/quote");
    expect(para?.mapAttrs).toBe(forwardMap);
    expect(quote?.mapAttrs).toBe(inverseMap);
  });
});
