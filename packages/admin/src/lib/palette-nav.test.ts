import { describe, expect, test } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import { paletteNavItems } from "./palette-nav.js";

const SOURCE: PlumixManifest = {
  adminNav: [
    {
      id: "content",
      label: { id: "g.content", message: "Content" },
      items: [
        {
          to: "/entries/posts",
          label: { id: "i.posts", message: "Posts" },
          coreIcon: "file-text",
        },
        {
          to: "/users",
          label: { id: "i.users", message: "Users" },
          capability: "user:list",
          coreIcon: "users",
        },
      ],
    },
  ],
};

describe("paletteNavItems", () => {
  test("flattens visible nav groups into a single item list", () => {
    const items = paletteNavItems(["user:list"], SOURCE);
    expect(items).toEqual([
      {
        to: "/entries/posts",
        label: { id: "i.posts", message: "Posts" },
        coreIcon: "file-text",
      },
      {
        to: "/users",
        label: { id: "i.users", message: "Users" },
        coreIcon: "users",
      },
    ]);
  });

  test("drops items whose capability the user lacks, reusing the sidebar filter", () => {
    const items = paletteNavItems([], SOURCE);
    expect(items.map((item) => item.to)).toEqual(["/entries/posts"]);
  });
});
