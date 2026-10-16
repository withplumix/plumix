import type { EditorStyleMark } from "@plumix/core/test/playwright";
import { expect, test } from "@plumix/core/test/playwright";

import { code, seedImage, seedPage } from "./support/seed-page.js";

interface StyleCase {
  readonly property: string;
  /** What the control takes. */
  readonly value: string;
  /** What the bucket stores, when it differs from `value`. */
  readonly stored?: string;
  /** The computed CSS that shows it in the canvas. */
  readonly css: readonly [property: string, value: string];
  /** Seeded on the block, for a control that shows only alongside them. */
  readonly given?: Readonly<Record<string, string>>;
}

const IMAGE = "https://example.test/fill.png";

const CASES: readonly StyleCase[] = [
  { property: "display", value: "flex", css: ["display", "flex"] },
  {
    property: "flexDirection",
    value: "column",
    css: ["flex-direction", "column"],
    given: { display: "flex" },
  },
  {
    property: "gap",
    value: "12px",
    css: ["column-gap", "12px"],
    given: { display: "grid" },
  },
  {
    property: "justifyContent",
    value: "center",
    css: ["justify-content", "center"],
    given: { display: "flex" },
  },
  {
    property: "alignItems",
    value: "flex-end",
    css: ["align-items", "flex-end"],
    given: { display: "flex" },
  },
  { property: "alignSelf", value: "center", css: ["align-self", "center"] },
  { property: "width", value: "240px", css: ["width", "240px"] },
  { property: "height", value: "80px", css: ["height", "80px"] },
  { property: "minWidth", value: "100px", css: ["min-width", "100px"] },
  { property: "minHeight", value: "50px", css: ["min-height", "50px"] },
  { property: "maxWidth", value: "300px", css: ["max-width", "300px"] },
  { property: "maxHeight", value: "200px", css: ["max-height", "200px"] },
  {
    property: "background",
    value: "#00ff00",
    css: ["background-color", "rgb(0, 255, 0)"],
  },
  { property: "color", value: "#ff0000", css: ["color", "rgb(255, 0, 0)"] },
  { property: "fontFamily", value: "serif", css: ["font-family", "serif"] },
  { property: "fontSize", value: "20px", css: ["font-size", "20px"] },
  { property: "fontWeight", value: "300", css: ["font-weight", "300"] },
  { property: "lineHeight", value: "30px", css: ["line-height", "30px"] },
  { property: "letterSpacing", value: "2px", css: ["letter-spacing", "2px"] },
  { property: "textAlign", value: "right", css: ["text-align", "right"] },
  { property: "marginTop", value: "7px", css: ["margin-top", "7px"] },
  { property: "marginRight", value: "8px", css: ["margin-right", "8px"] },
  { property: "marginBottom", value: "9px", css: ["margin-bottom", "9px"] },
  { property: "marginLeft", value: "10px", css: ["margin-left", "10px"] },
  { property: "paddingTop", value: "14px", css: ["padding-top", "14px"] },
  { property: "paddingRight", value: "11px", css: ["padding-right", "11px"] },
  {
    property: "paddingBottom",
    value: "12px",
    css: ["padding-bottom", "12px"],
  },
  { property: "paddingLeft", value: "13px", css: ["padding-left", "13px"] },
  {
    property: "borderStyle",
    value: "dashed",
    css: ["border-top-style", "dashed"],
  },
  {
    property: "borderColor",
    value: "#0000ff",
    css: ["border-top-color", "rgb(0, 0, 255)"],
  },
  {
    property: "borderWidth",
    value: "3px",
    css: ["border-top-width", "3px"],
    given: { borderStyle: "solid" },
  },
  {
    property: "borderRadius",
    value: "6px",
    css: ["border-top-left-radius", "6px"],
  },
  { property: "opacity", value: "0.5", css: ["opacity", "0.5"] },
  {
    property: "boxShadow",
    value: "2px 2px 4px #000000",
    css: ["box-shadow", "rgb(0, 0, 0) 2px 2px 4px 0px"],
  },
];

for (const { property, value, stored, css, given = {} } of CASES) {
  test(`the ${property} control styles the block in the canvas and is stored`, async ({
    editor,
  }) => {
    await editor.open(
      await seedPage([{ ...code("styled"), style: { large: given } }]),
    );
    const block = editor.canvas.block("core/code");
    await editor.select(block);

    await editor.styles.set(property, value);

    await expect(block).toHaveCSS(...css);
    await editor.save();
    await editor.reload();
    await expect(editor.canvas.block("core/code")).toHaveCSS(...css);
    expect(await editor.stored()).toEqual([
      {
        id: "styled",
        name: "core/code",
        attrs: { text: "styled" },
        style: { large: { ...given, [property]: stored ?? value } },
      },
    ]);
  });
}

test("the backgroundImage control takes a library image and stores its URL", async ({
  editor,
}) => {
  const image = await seedImage(IMAGE);
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.set("backgroundImage", String(image));

  await expect(block).toHaveCSS("background-image", `url("${IMAGE}")`);
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS(
    "background-image",
    `url("${IMAGE}")`,
  );
  expect(await editor.stored()).toEqual([
    {
      id: "styled",
      name: "core/code",
      attrs: { text: "styled" },
      style: { large: { backgroundImage: `url("${IMAGE}")` } },
    },
  ]);
});

test("a theme token picked for a property is stored as its variable and styles the block", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.token("color", "accent");

  await expect(block).toHaveCSS("color", "rgb(181, 71, 45)");
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS(
    "color",
    "rgb(181, 71, 45)",
  );
  expect(await editor.stored()).toMatchObject([
    { style: { large: { color: "var(--plumix-color-accent, #b5472d)" } } },
  ]);
});

interface MarkCase {
  readonly mark: EditorStyleMark;
  readonly property: string;
  readonly on: string;
  readonly css: readonly [property: string, value: string];
}

const MARKS: readonly MarkCase[] = [
  {
    mark: "bold",
    property: "fontWeight",
    on: "bold",
    css: ["font-weight", "700"],
  },
  {
    mark: "italic",
    property: "fontStyle",
    on: "italic",
    css: ["font-style", "italic"],
  },
  {
    mark: "underline",
    property: "textDecoration",
    on: "underline",
    css: ["text-decoration-line", "underline"],
  },
  {
    mark: "strikethrough",
    property: "textDecoration",
    on: "line-through",
    css: ["text-decoration-line", "line-through"],
  },
];

for (const { mark, property, on, css } of MARKS) {
  test(`the ${mark} toggle styles the block's text and is stored`, async ({
    editor,
  }) => {
    await editor.open(await seedPage([code("styled")]));
    const block = editor.canvas.block("core/code");
    await editor.select(block);

    await editor.styles.mark(mark);

    await expect(block).toHaveCSS(...css);
    await editor.save();
    await editor.reload();
    await expect(editor.canvas.block("core/code")).toHaveCSS(...css);
    expect(await editor.stored()).toMatchObject([
      { style: { large: { [property]: on } } },
    ]);
  });
}

test("the text shadow controls shadow the block's text and are stored", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.textShadow({
    x: "2",
    y: "3",
    blur: "4",
    color: "#ff0000",
  });

  const shadow = "rgb(255, 0, 0) 2px 3px 4px";
  await expect(block).toHaveCSS("text-shadow", shadow);
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS(
    "text-shadow",
    shadow,
  );
  expect(await editor.stored()).toMatchObject([
    { style: { large: { textShadow: "2px 3px 4px #ff0000" } } },
  ]);
});

test("Hide on desktop hides the block in the canvas and is stored off its style", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.hide("desktop", true);

  await expect(block).toHaveCSS("display", "none");
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS("display", "none");
  expect(await editor.stored()).toEqual([
    {
      id: "styled",
      name: "core/code",
      attrs: { text: "styled" },
      hidden: { large: true },
    },
  ]);
});

test("CSS classes are put on the block and stored", async ({ editor }) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.className("callout wide");

  await expect(block).toHaveClass(/\bcallout wide\b/);
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveClass(
    /\bcallout wide\b/,
  );
  expect(await editor.stored()).toMatchObject([{ className: "callout wide" }]);
});

test("a custom CSS declaration styles the block and is stored in its bucket", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.declare("textTransform", "uppercase");

  await expect(block).toHaveCSS("text-transform", "uppercase");
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  expect(await editor.stored()).toMatchObject([
    { style: { large: { textTransform: "uppercase" } } },
  ]);
});

test("a tag name renders the block as that element and is stored", async ({
  editor,
}) => {
  // `core/code` is its own `<pre>`; a group renders whatever tag it is given.
  await editor.open(
    await seedPage([
      { id: "styled", name: "core/group", attrs: { content: [code("inner")] } },
    ]),
  );
  await editor.select(editor.canvas.block("core/group"));

  await editor.styles.tagName("section");

  const tag = (): Promise<string> =>
    editor.canvas.block("core/group").evaluate((el) => el.tagName);
  await expect.poll(tag).toBe("SECTION");
  await editor.save();
  await editor.reload();
  await expect.poll(tag).toBe("SECTION");
  expect(await editor.stored()).toMatchObject([{ tagName: "section" }]);
});

test("an HTML attribute is put on the block and stored", async ({ editor }) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);

  await editor.styles.attribute("title", "Snippet");

  await expect(block).toHaveAttribute("title", "Snippet");
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveAttribute(
    "title",
    "Snippet",
  );
  expect(await editor.stored()).toMatchObject([
    { htmlAttrs: { title: "Snippet" } },
  ]);
});
