import { expect, test } from "vitest";

import { fakeImage } from "./fakes.js";

test("a browser decodes fakeImage at the size it was asked for", async () => {
  const bitmap = await createImageBitmap(
    fakeImage("a.png", { width: 37, height: 21 }),
  );

  expect([bitmap.width, bitmap.height]).toEqual([37, 21]);
});
