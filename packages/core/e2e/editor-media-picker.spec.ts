import { resolve } from "node:path";

import { factoriesFor } from "@plumix/core/test";
import { expect, openPlaygroundDb, test } from "@plumix/core/test/playwright";

// Upload is plugin-media's own e2e concern, so the library row is seeded. With
// no storage configured, a row's storage key is the URL it serves from.
test("the media picker puts a library image in an image block", async ({
  editor,
}) => {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const factories = factoriesFor(db);
  const author = await factories.admin.create({});
  const url = "https://example.test/harbour.png";
  const media = await factories.entry.create({
    type: "media",
    title: "Harbour at dawn",
    status: "published",
    authorId: author.id,
    meta: {
      mime: "image/png",
      size: 68,
      storageKey: url,
      originalName: "harbour.png",
      alt: "Boats moored at dawn",
    },
  });
  db.$client.close();

  await editor.create("page");
  const image = await editor.insert("media/image");

  await editor.inspector.set("media", media.id);
  await expect(image.locator("img")).toHaveAttribute("src", url);

  await editor.save();
  await editor.reload();

  expect(await editor.stored()).toMatchObject([
    {
      name: "media/image",
      attrs: {
        media: { id: String(media.id), url, alt: "Boats moored at dawn" },
      },
    },
  ]);
  await editor.select(editor.canvas.block("media/image"));
  expect(await editor.inspector.get("media")).toBe("Harbour at dawn");
  await expect(
    editor.canvas.block("media/image").locator("img"),
  ).toHaveAttribute("alt", "Boats moored at dawn");
});
