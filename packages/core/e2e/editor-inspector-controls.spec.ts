import type { Locator } from "@playwright/test";

import type { Editor, EditorInputValue } from "@plumix/core/test/playwright";
import { expect, test } from "@plumix/core/test/playwright";

async function setAndReload(
  editor: Editor,
  name: string,
  field: string,
  value: EditorInputValue,
  shows: (block: Locator) => Promise<void>,
): Promise<void> {
  await editor.create("page");
  const block = await editor.insert(name);
  await editor.inspector.set(field, value);
  await shows(block);

  await editor.save();
  await editor.reload();

  expect(await editor.stored()).toMatchObject([
    { name, attrs: { [field]: value } },
  ]);
  await editor.select(editor.canvas.block(name));
  expect(await editor.inspector.get(field)).toBe(value);
  await shows(editor.canvas.block(name));
}

test("a select sets where columns stack", async ({ editor }) => {
  await setAndReload(editor, "core/columns", "stackAt", "mobile", (columns) =>
    expect
      .poll(() => columns.locator(":scope > style").textContent())
      .toContain("max-width: 640px"),
  );
});

test("a checkbox opens a details block by default", async ({ editor }) => {
  await setAndReload(editor, "core/details", "open", true, (details) =>
    expect(details.locator("details")).toHaveAttribute("open", ""),
  );
});

test("a combobox sets a code block's language", async ({ editor }) => {
  await setAndReload(editor, "core/code", "language", "python", (code) =>
    expect(code).toHaveAttribute("data-language", "python"),
  );
});

test("a URL input sets a video's source", async ({ editor }) => {
  const src = "https://example.test/clip.mp4";
  await setAndReload(editor, "core/video", "src", src, (video) =>
    expect(video).toHaveAttribute("src", src),
  );
});

test("a text input sets a details block's summary", async ({ editor }) => {
  await setAndReload(
    editor,
    "core/details",
    "summary",
    "Read more",
    (details) => expect(details.locator("summary")).toHaveText("Read more"),
  );
});

// No core block declares a number or radio input, so the playground's own
// rating block carries both.
test("a number input sets a rating's score", async ({ editor }) => {
  await setAndReload(editor, "playground/rating", "score", 4, (rating) =>
    expect(rating).toHaveText("★★★★"),
  );
});

test("a radio input sets a rating's symbol", async ({ editor }) => {
  await setAndReload(editor, "playground/rating", "symbol", "heart", (rating) =>
    expect(rating).toHaveText("♥♥♥"),
  );
});
