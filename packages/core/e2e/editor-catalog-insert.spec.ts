import { test as base, expect } from "@plumix/core/test/playwright";

import { openPost, seedFixture } from "./support/seed.js";

const test = base.extend(seedFixture);

const CODE = { id: "code", name: "core/code" } as const;
const SEPARATOR = { id: "separator", name: "core/separator" } as const;

test("a catalog click inserts the block right after the selected one", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  const code = editor.canvas.block("core/code");

  await editor.insert("core/html", { at: { after: code } });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/html",
    "core/separator",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/html" },
    { name: "core/separator" },
  ]);
});

test("a catalog drag to the end appends the block", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [CODE]);

  await editor.insert("core/separator", { via: "drag" });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual(["core/code", "core/separator"]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/separator" },
  ]);
});

test("a catalog drag between two blocks inserts the block there", async ({
  editor,
  seed,
}) => {
  await openPost(editor, seed, [CODE, SEPARATOR]);
  const separator = editor.canvas.block("core/separator");

  await editor.insert("core/html", { via: "drag", at: { before: separator } });
  await editor.save();
  await editor.reload();

  expect(await editor.canvas.blocks()).toEqual([
    "core/code",
    "core/html",
    "core/separator",
  ]);
  expect(await editor.stored()).toMatchObject([
    { name: "core/code" },
    { name: "core/html" },
    { name: "core/separator" },
  ]);
});
