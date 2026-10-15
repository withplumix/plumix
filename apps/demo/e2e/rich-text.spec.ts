import type { Page } from "@playwright/test";
import type {
  Editor,
  EditorRichText,
  EditorTextFormat,
} from "plumix/test/playwright";
import { expect, test } from "plumix/test/playwright";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Every mark the rich-text toolbar has a toggle for, and the tag it stores. */
const MARKS = [
  { format: "bold", tag: "strong" },
  { format: "italic", tag: "em" },
  { format: "underline", tag: "u" },
  { format: "strike", tag: "s" },
  { format: "code", tag: "code" },
  { format: "highlight", tag: "mark" },
  { format: "subscript", tag: "sub" },
  { format: "superscript", tag: "sup" },
] as const satisfies readonly {
  readonly format: EditorTextFormat;
  readonly tag: string;
}[];

const BLOCKS = [
  { format: "bullet-list", body: "<ul><li><p>Plumix</p></li></ul>" },
  { format: "ordered-list", body: "<ol><li><p>Plumix</p></li></ol>" },
  { format: "quote", body: "<blockquote><p>Plumix</p></blockquote>" },
] as const satisfies readonly {
  readonly format: EditorTextFormat;
  readonly body: string;
}[];

const escape = (text: string): string =>
  text.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const exactly = (html: string): RegExp => new RegExp(`^${escape(html)}$`);

/** The link's other attributes (`rel`) are the link mark's, not this test's. */
const linked = (url: string): RegExp =>
  new RegExp(`^<p><a href="${escape(url)}"[^>]*>Plumix</a></p>$`);

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
}

/** The body as the canvas renders it, out of the block's own `<div>`. */
async function shownBody(editor: Editor): Promise<string> {
  const html = await editor.canvas.block("core/rich-text").innerHTML();
  return /^<div>(.*)<\/div>$/s.exec(html)?.[1] ?? html;
}

const storedBody = async (editor: Editor): Promise<unknown> =>
  (await editor.stored())[0]?.attrs?.body;

/** Saves, then checks what the canvas shows and what the server stored. */
async function expectBody(editor: Editor, body: RegExp): Promise<void> {
  await editor.save();
  await expect.poll(() => shownBody(editor)).toMatch(body);
  expect(await storedBody(editor)).toMatch(body);
}

/** `expectBody`, then again from a reload. */
async function expectBodyKept(editor: Editor, body: RegExp): Promise<void> {
  await expectBody(editor, body);
  await editor.reload();
  expect(await storedBody(editor)).toMatch(body);
  await expect.poll(() => shownBody(editor)).toMatch(body);
}

/** A new post holding one text block that reads "Plumix". */
async function textBlock(editor: Editor): Promise<EditorRichText> {
  await editor.create("post");
  const text = editor.richText(await editor.insert("core/rich-text"));
  await text.type("Plumix");
  return text;
}

// Every visitor gets their own database, so each test enters the demo first.
test.beforeEach(async ({ page }) => {
  await enterDemo(page);
});

for (const level of HEADING_LEVELS) {
  test(`the format dropdown turns the text into a level ${String(level)} heading`, async ({
    editor,
  }) => {
    const text = await textBlock(editor);

    await text.format(`heading-${level}`);

    await expectBodyKept(
      editor,
      exactly(`<h${String(level)}>Plumix</h${String(level)}>`),
    );
  });
}

test("the format dropdown turns a heading back into a paragraph", async ({
  editor,
}) => {
  const text = await textBlock(editor);
  await text.format("heading-2");

  await text.format("paragraph");

  await expectBodyKept(editor, exactly("<p>Plumix</p>"));
});

for (const { format, tag } of MARKS) {
  test(`the ${format} toggle wraps the text in a ${tag} mark`, async ({
    editor,
  }) => {
    const text = await textBlock(editor);

    await text.format(format);

    await expectBodyKept(editor, exactly(`<p><${tag}>Plumix</${tag}></p>`));
  });
}

for (const { format, body } of BLOCKS) {
  test(`the ${format} toggle wraps the paragraph`, async ({ editor }) => {
    const text = await textBlock(editor);

    await text.format(format);

    await expectBodyKept(editor, exactly(body));
  });
}

test("a link is set, edited and removed, and each step is stored", async ({
  editor,
}) => {
  const text = await textBlock(editor);

  await text.link("https://example.test/first");
  await expectBody(editor, linked("https://example.test/first"));

  await text.link("https://example.test/second");
  await expectBody(editor, linked("https://example.test/second"));

  await text.unlink();
  await expectBodyKept(editor, exactly("<p>Plumix</p>"));
});
