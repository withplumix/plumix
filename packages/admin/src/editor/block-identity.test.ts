import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

import { deriveBlockIdentity } from "./block-identity.js";

describe("deriveBlockIdentity", () => {
  test("falls back to the parent block when no variation matches", () => {
    const spec = defineBlock({
      name: "core/heading",
      title: "Heading",
      icon: "Heading",
      description: "Section heading",
      render: () => null,
    });
    expect(deriveBlockIdentity(spec, { level: 2 })).toEqual({
      title: "Heading",
      icon: "Heading",
      description: "Section heading",
    });
  });

  test("uses the active variation's title and icon when isActive matches", () => {
    const spec = defineBlock({
      name: "core/list",
      title: "List",
      icon: "List",
      render: () => null,
      variations: [
        {
          slug: "bullet",
          title: "Bulleted list",
          icon: "List",
          description: "Disc bullets",
          attrs: { variant: "bullet" },
          isActive: ["variant"],
        },
      ],
    });
    expect(deriveBlockIdentity(spec, { variant: "bullet" })).toEqual({
      title: "Bulleted list",
      icon: "List",
      description: "Disc bullets",
    });
  });
});
