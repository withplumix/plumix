import type { Page } from "@playwright/test";
import type {
  Editor,
  EditorRichText,
  EditorTextFormat,
} from "plumix/test/playwright";
import { expect, test } from "plumix/test/playwright";

type Body = string | RegExp;

const HEADINGS = [
  { format: "heading-1", body: "<h1>Plumix</h1>" },
  { format: "heading-2", body: "<h2>Plumix</h2>" },
  { format: "heading-3", body: "<h3>Plumix</h3>" },
  { format: "heading-4", body: "<h4>Plumix</h4>" },
  { format: "heading-5", body: "<h5>Plumix</h5>" },
  { format: "heading-6", body: "<h6>Plumix</h6>" },
] as const satisfies readonly {
  readonly format: EditorTextFormat;
  readonly body: string;
}[];

const MARKS = [
  { format: "bold", body: "<p><strong>Plumix</strong></p>" },
  { format: "italic", body: "<p><em>Plumix</em></p>" },
  { format: "underline", body: "<p><u>Plumix</u></p>" },
  { format: "strike", body: "<p><s>Plumix</s></p>" },
  { format: "code", body: "<p><code>Plumix</code></p>" },
  { format: "highlight", body: "<p><mark>Plumix</mark></p>" },
  { format: "subscript", body: "<p><sub>Plumix</sub></p>" },
  { format: "superscript", body: "<p><sup>Plumix</sup></p>" },
] as const satisfies readonly {
  readonly format: EditorTextFormat;
  readonly body: string;
}[];

const BLOCKS = [
  { format: "bullet-list", body: "<ul><li><p>Plumix</p></li></ul>" },
  { format: "ordered-list", body: "<ol><li><p>Plumix</p></li></ol>" },
  { format: "quote", body: "<blockquote><p>Plumix</p></blockquote>" },
] as const satisfies readonly {
  readonly format: EditorTextFormat;
  readonly body: string;
}[];

/** The link's other attributes (`rel`) are the link mark's, not this test's. */
const FIRST_LINK =
  /^<p><a href="https:\/\/example\.test\/first"[^>]*>Plumix<\/a><\/p>$/;
const SECOND_LINK =
  /^<p><a href="https:\/\/example\.test\/second"[^>]*>Plumix<\/a><\/p>$/;

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("try-editor").click();
  await page.waitForURL(/\/_plumix\/admin/);
}

async function shownBody(editor: Editor): Promise<string> {
  const html = await editor.canvas.block("core/rich-text").innerHTML();
  return /^<div>(.*)<\/div>$/s.exec(html)?.[1] ?? html;
}

async function expectShown(editor: Editor, body: Body): Promise<void> {
  const shown = expect.poll(() => shownBody(editor));
  if (typeof body === "string") await shown.toBe(body);
  else await shown.toMatch(body);
}

async function expectStored(editor: Editor, body: Body): Promise<void> {
  const stored = (await editor.stored())[0]?.attrs?.body;
  if (typeof body === "string") expect(stored).toBe(body);
  else expect(stored).toMatch(body);
}

async function expectBody(editor: Editor, body: Body): Promise<void> {
  await editor.save();
  await expectShown(editor, body);
  await expectStored(editor, body);
}

async function expectBodyKept(editor: Editor, body: Body): Promise<void> {
  await expectBody(editor, body);
  await editor.reload();
  await expectStored(editor, body);
  await expectShown(editor, body);
}

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

for (const { format, body } of HEADINGS) {
  test(`the format dropdown turns the text into a ${format} heading`, async ({
    editor,
  }) => {
    const text = await textBlock(editor);

    await text.format(format);

    await expectBodyKept(editor, body);
  });
}

test("the format dropdown turns a heading back into a paragraph", async ({
  editor,
}) => {
  const text = await textBlock(editor);
  await text.format("heading-2");

  await text.format("paragraph");

  await expectBodyKept(editor, "<p>Plumix</p>");
});

for (const { format, body } of MARKS) {
  test(`the ${format} toggle marks the text`, async ({ editor }) => {
    const text = await textBlock(editor);

    await text.format(format);

    await expectBodyKept(editor, body);
  });
}

for (const { format, body } of BLOCKS) {
  test(`the ${format} toggle wraps the paragraph`, async ({ editor }) => {
    const text = await textBlock(editor);

    await text.format(format);

    await expectBodyKept(editor, body);
  });
}

test("a link is set on the text and stored", async ({ editor }) => {
  const text = await textBlock(editor);

  await text.link("https://example.test/first");

  await expectBody(editor, FIRST_LINK);
});

test("a link is edited to another address and stored", async ({ editor }) => {
  const text = await textBlock(editor);
  await text.link("https://example.test/first");

  await text.link("https://example.test/second");

  await expectBody(editor, SECOND_LINK);
});

test("a link is removed from the text and the removal is stored", async ({
  editor,
}) => {
  const text = await textBlock(editor);
  await text.link("https://example.test/first");

  await text.unlink();

  await expectBodyKept(editor, "<p>Plumix</p>");
});
