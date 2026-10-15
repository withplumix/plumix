import { expect, test } from "@plumix/core/test/playwright";

import { code, seedPage } from "./support/seed-page.js";

const RED = "rgb(255, 0, 0)";
const BLACK = "rgb(0, 0, 0)";

test("a style set on tablet is stored in its bucket and leaves desktop as it was", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  const block = editor.canvas.block("core/code");
  await editor.select(block);
  await editor.device("tablet");

  await editor.styles.set("color", "#ff0000");

  await expect(block).toHaveCSS("color", RED);
  await editor.device("desktop");
  await expect(block).toHaveCSS("color", BLACK);
  await editor.save();
  await editor.reload();
  await expect(editor.canvas.block("core/code")).toHaveCSS("color", BLACK);
  await editor.device("tablet");
  await expect(editor.canvas.block("core/code")).toHaveCSS("color", RED);
  expect(await editor.stored()).toEqual([
    {
      id: "styled",
      name: "core/code",
      attrs: { text: "styled" },
      style: { medium: { color: "#ff0000" } },
    },
  ]);
});

test("a style set on mobile is stored in its bucket and reaches neither tablet nor desktop", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  await editor.select(editor.canvas.block("core/code"));
  await editor.device("mobile");

  await editor.styles.set("color", "#ff0000");

  await editor.save();
  await editor.reload();
  const block = editor.canvas.block("core/code");
  await editor.device("mobile");
  await expect(block).toHaveCSS("color", RED);
  await editor.device("tablet");
  await expect(block).toHaveCSS("color", BLACK);
  await editor.device("desktop");
  await expect(block).toHaveCSS("color", BLACK);
  expect((await editor.stored())[0]?.style).toEqual({
    small: { color: "#ff0000" },
  });
});

test("one property set per device keeps each device's own value", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  await editor.select(editor.canvas.block("core/code"));

  await editor.styles.set("width", "300px");
  await editor.device("tablet");
  await editor.styles.set("width", "200px");
  await editor.device("mobile");
  await editor.styles.set("width", "100px");

  await editor.save();
  await editor.reload();
  const block = editor.canvas.block("core/code");
  for (const [device, width] of [
    ["desktop", "300px"],
    ["tablet", "200px"],
    ["mobile", "100px"],
  ] as const) {
    await editor.device(device);
    await expect(block).toHaveCSS("width", width);
  }
  expect((await editor.stored())[0]?.style).toEqual({
    large: { width: "300px" },
    medium: { width: "200px" },
    small: { width: "100px" },
  });
});

test("a narrower device's empty control shows the value it inherits from desktop", async ({
  editor,
}) => {
  await editor.open(await seedPage([code("styled")]));
  await editor.select(editor.canvas.block("core/code"));
  await editor.styles.set("width", "240px");

  await editor.device("mobile");

  expect(await editor.styles.inherited("width")).toBe("240px");
  await editor.save();
  await editor.reload();
  await editor.select(editor.canvas.block("core/code"));
  await editor.device("mobile");
  await expect(editor.canvas.block("core/code")).toHaveCSS("width", "240px");
  expect(await editor.styles.inherited("width")).toBe("240px");
  expect((await editor.stored())[0]?.style).toEqual({
    large: { width: "240px" },
  });
});

test("Hide on mobile hides the block on mobile only", async ({ editor }) => {
  await editor.open(await seedPage([code("styled")]));
  await editor.select(editor.canvas.block("core/code"));

  await editor.styles.hide("mobile", true);

  await editor.save();
  await editor.reload();
  const block = editor.canvas.block("core/code");
  await editor.device("mobile");
  await expect(block).toHaveCSS("display", "none");
  await editor.device("tablet");
  await expect(block).toHaveCSS("display", "block");
  await editor.device("desktop");
  await expect(block).toHaveCSS("display", "block");
  expect((await editor.stored())[0]?.hidden).toEqual({ small: true });
});
