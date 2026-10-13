import { describe, expect, test } from "vitest";

import {
  contentNeedsReset,
  storedHtml,
  storedJson,
} from "./rich-text-stored.js";

describe("storedHtml", () => {
  test("a heading stores no trailing empty paragraph", () => {
    expect(storedHtml("<h2>Hi</h2><p></p>")).toBe("<h2>Hi</h2>");
  });

  test("an empty document stays one empty paragraph", () => {
    expect(storedHtml("<p></p>")).toBe("<p></p>");
  });
});

describe("storedJson", () => {
  test("a heading stores no trailing empty paragraph", () => {
    const heading = {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Hi" }],
    };

    expect(
      storedJson({
        type: "doc",
        content: [heading, { type: "paragraph" }],
      }),
    ).toEqual({ type: "doc", content: [heading] });
  });

  test("an empty document stays one empty paragraph", () => {
    expect(
      storedJson({ type: "doc", content: [{ type: "paragraph" }] }),
    ).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("contentNeedsReset", () => {
  const hello = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
    ],
  };

  test("a JSON value reset to null clears an editor holding content", () => {
    expect(contentNeedsReset("json", null, hello, false)).toBe(true);
  });

  test("a JSON value of null leaves an empty editor alone", () => {
    expect(
      contentNeedsReset(
        "json",
        null,
        { type: "doc", content: [{ type: "paragraph" }] },
        true,
      ),
    ).toBe(false);
  });

  test("a JSON value equal to the editor's stored form needs no reset", () => {
    expect(
      contentNeedsReset(
        "json",
        hello,
        { ...hello, content: [...hello.content, { type: "paragraph" }] },
        false,
      ),
    ).toBe(false);
  });

  test("a JSON value that differs from the editor's resets it", () => {
    expect(
      contentNeedsReset(
        "json",
        hello,
        { type: "doc", content: [{ type: "paragraph" }] },
        true,
      ),
    ).toBe(true);
  });

  test("an HTML value equal to the editor's stored form needs no reset", () => {
    expect(
      contentNeedsReset("html", "<h2>Hi</h2>", "<h2>Hi</h2><p></p>", false),
    ).toBe(false);
  });

  test("an HTML value that differs from the editor's resets it", () => {
    expect(
      contentNeedsReset("html", "<p>Hi</p>", "<h2>Hi</h2><p></p>", false),
    ).toBe(true);
  });
});
