import { describe, expect, test } from "vitest";

import { paragraphBlock } from "../../paragraph/index.js";
import {
  mockMarkRegistry,
  mockRegistry,
  renderBlock,
  stripBlockMarkers,
} from "../../test/index.js";
import { coreMarks } from "./index.js";

/**
 * The walker-switch slice replaces the walker's hardcoded mark dispatch
 * with a registry-driven lookup. These tests assert each shipped mark
 * renders to its canonical HTML element. They double as the contract
 * the BubbleMenu + theme-override tests build on.
 */

async function renderTextWithMark(
  markType: string,
  attrs?: Record<string, unknown>,
): Promise<string> {
  const registry = await mockRegistry({ core: [paragraphBlock] });
  const markRegistry = await mockMarkRegistry({ core: coreMarks });
  return renderBlock({
    registry,
    markRegistry,
    content: {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "Hi",
              marks: [{ type: markType, attrs }],
            },
          ],
        },
      ],
    },
  });
}

describe("core marks — HTML element mapping", () => {
  test.each([
    { mark: "bold", expected: "<p><strong>Hi</strong></p>" },
    { mark: "italic", expected: "<p><em>Hi</em></p>" },
    { mark: "strike", expected: "<p><s>Hi</s></p>" },
    { mark: "code", expected: "<p><code>Hi</code></p>" },
    { mark: "underline", expected: "<p><u>Hi</u></p>" },
    { mark: "subscript", expected: "<p><sub>Hi</sub></p>" },
    { mark: "superscript", expected: "<p><sup>Hi</sup></p>" },
    { mark: "highlight", expected: "<p><mark>Hi</mark></p>" },
    { mark: "kbd", expected: "<p><kbd>Hi</kbd></p>" },
    { mark: "cite", expected: "<p><cite>Hi</cite></p>" },
    { mark: "small", expected: "<p><small>Hi</small></p>" },
  ])("$mark renders as $expected", async ({ mark, expected }) => {
    expect(stripBlockMarkers(await renderTextWithMark(mark))).toBe(expected);
  });
});

describe("core marks — link", () => {
  test("renders <a href> with rel=noopener for safe https hrefs", async () => {
    expect(
      stripBlockMarkers(
        await renderTextWithMark("link", { href: "https://example.com" }),
      ),
    ).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">Hi</a></p>',
    );
  });

  test("strips unsafe javascript: hrefs", async () => {
    expect(
      stripBlockMarkers(
        await renderTextWithMark("link", { href: "javascript:alert(1)" }),
      ),
    ).toBe("<p>Hi</p>");
  });

  test("emits target when set", async () => {
    const html = await renderTextWithMark("link", {
      href: "https://example.com",
      target: "_blank",
    });
    expect(stripBlockMarkers(html)).toContain('target="_blank"');
  });

  test("ignores attacker-controlled rel that strips safety tokens", async () => {
    expect(
      stripBlockMarkers(
        await renderTextWithMark("link", {
          href: "https://example.com",
          rel: "",
        }),
      ),
    ).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">Hi</a></p>',
    );
    expect(
      stripBlockMarkers(
        await renderTextWithMark("link", {
          href: "https://example.com",
          rel: "opener",
        }),
      ),
    ).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">Hi</a></p>',
    );
  });
});

describe("core marks — abbr", () => {
  test("renders <abbr title> with the title attribute", async () => {
    expect(
      stripBlockMarkers(
        await renderTextWithMark("abbr", {
          title: "HyperText Markup Language",
        }),
      ),
    ).toBe('<p><abbr title="HyperText Markup Language">Hi</abbr></p>');
  });

  test("omits title attribute when empty", async () => {
    expect(
      stripBlockMarkers(await renderTextWithMark("abbr", { title: "" })),
    ).toBe("<p><abbr>Hi</abbr></p>");
  });
});
