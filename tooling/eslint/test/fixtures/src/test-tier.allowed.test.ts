import { expect, test } from "vitest";

import { renderHelper } from "./test/dom-helper.js";

test("server-side code can ask whether a DOM is there", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document === "undefined").toBe(true);
  expect(typeof globalThis.navigator).toBe("object");
});

test("a local of the same name is not the global", () => {
  const document = { title: "local" };
  expect(document.title).toBe("local");
  expect(renderHelper).toBeDefined();
});
