import { entry } from "plumix/plugin";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { menu } from "../../src/index.js";

const site = await testSite({ plugins: [menu()] });

/** A menu holding a root item and a child under it, as the editor saved it. */
async function savedMenu() {
  const editor = site.actingAs("editor");
  const { termId, etag } = await editor.rpc.menu.create({ name: "Main" });
  const saved = await editor.rpc.menu.save({
    termId,
    ifMatch: etag,
    items: [
      {
        parentIndex: null,
        sortOrder: 0,
        title: "Home",
        meta: { kind: "custom", url: "/" },
      },
      {
        parentIndex: 0,
        sortOrder: 0,
        title: "About",
        meta: { kind: "custom", url: "/about", target: "_blank" },
      },
    ],
  });
  const [home, about] = saved.itemIds;
  if (home === undefined || about === undefined) throw new Error("seed");
  return { editor, termId, etag: saved.etag, home, about };
}

describe("saving a menu", () => {
  test("stores an existing item's new title, place and link", async () => {
    const { editor, termId, etag, home, about } = await savedMenu();

    await editor.rpc.menu.save({
      termId,
      ifMatch: etag,
      items: [
        {
          id: about,
          parentIndex: null,
          sortOrder: 0,
          title: "About us",
          meta: { kind: "custom", url: "/about-us" },
        },
        {
          id: home,
          parentIndex: null,
          sortOrder: 1,
          title: "Home",
          meta: { kind: "custom", url: "/" },
        },
      ],
    });

    const { items } = await editor.rpc.menu.get({ termId });
    expect(items.find((item) => item.id === about)).toMatchObject({
      title: "About us",
      parentId: null,
      sortOrder: 0,
      meta: { kind: "custom", url: "/about-us" },
    });
    expect(items.find((item) => item.id === about)?.meta).not.toHaveProperty(
      "target",
    );
    expect(items.find((item) => item.id === home)).toMatchObject({
      sortOrder: 1,
    });
  });

  test("leaves an item the save did not change alone", async () => {
    const { editor, termId, etag, home, about } = await savedMenu();

    await editor.rpc.menu.save({
      termId,
      ifMatch: etag,
      items: [
        {
          id: home,
          parentIndex: null,
          sortOrder: 0,
          title: "Home",
          meta: { kind: "custom", url: "/" },
        },
        {
          id: about,
          parentIndex: 0,
          sortOrder: 0,
          title: "About",
          meta: { kind: "custom", url: "/about", target: "_blank" },
        },
      ],
    });

    site.events.assertNotEmitted(entry.updated);
  });
});

describe("deleting a menu", () => {
  test("deletes its items", async () => {
    const { editor, termId, home, about } = await savedMenu();

    await editor.rpc.menu.delete({ termId });

    const left = await site.context.db.query.entries.findMany({
      where: (entries, { inArray }) => inArray(entries.id, [home, about]),
    });
    expect(left).toEqual([]);
  });
});
