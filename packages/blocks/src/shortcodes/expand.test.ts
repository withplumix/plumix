import { describe, expect, test, vi } from "vitest";

import type { ShortcodeContext, ShortcodeSpec } from "./types.js";
import { expandShortcodes } from "./expand.js";

const ctx: ShortcodeContext = { siteSettings: {}, locale: "en", entry: null };

function registry(...specs: ShortcodeSpec[]): Map<string, ShortcodeSpec> {
  return new Map(specs.map((spec) => [spec.name, spec]));
}

describe("expandShortcodes", () => {
  test("expands a registered bare tag inline", () => {
    const reg = registry({ name: "greet", render: () => "hi" });
    expect(expandShortcodes("a [greet] b", reg, ctx)).toBe("a hi b");
  });

  test("passes unregistered bracket text through verbatim", () => {
    const reg = registry({ name: "year", render: () => "2026" });
    expect(expandShortcodes("[1] [citation needed] [TODO]", reg, ctx)).toBe(
      "[1] [citation needed] [TODO]",
    );
  });

  test("returns a string with no '[' unchanged via the fast path", () => {
    const reg = registry({ name: "year", render: () => "2026" });
    const input = "plain prose, no macros here";
    expect(expandShortcodes(input, reg, ctx)).toBe(input);
  });

  test("renders the literal tag for the escaped form [[tag]]", () => {
    const reg = registry({ name: "year", render: () => "2026" });
    expect(expandShortcodes("Best Shoes for [[year]]", reg, ctx)).toBe(
      "Best Shoes for [year]",
    );
  });

  test("escaping is structural: [[tag]] unwraps even for an unregistered tag", () => {
    const reg = registry({ name: "year", render: () => "2026" });
    expect(expandShortcodes("[[notreg]]", reg, ctx)).toBe("[notreg]");
  });

  test("escapes an attributed tag literally rather than expanding it", () => {
    const reg = registry({ name: "month", render: () => "June" });
    expect(expandShortcodes('[[month format="short"]]', reg, ctx)).toBe(
      '[month format="short"]',
    );
  });

  test("is single-pass: output containing a tag is not re-scanned", () => {
    const reg = registry({ name: "echo", render: () => "[year]" });
    expect(expandShortcodes("[echo]", reg, ctx)).toBe("[year]");
  });

  test("expands multiple shortcodes in one string", () => {
    const reg = registry(
      { name: "a", render: () => "1" },
      { name: "b", render: () => "2" },
    );
    expect(expandShortcodes("[a] and [b]", reg, ctx)).toBe("1 and 2");
  });

  test("escapes shortcode output so HTML cannot be injected", () => {
    const reg = registry({ name: "evil", render: () => '<b x="y">&\'' });
    expect(expandShortcodes("[evil]", reg, ctx)).toBe(
      "&lt;b x=&quot;y&quot;&gt;&amp;&#39;",
    );
  });

  test("renders empty when a registered shortcode throws", () => {
    const reg = registry({
      name: "boom",
      render: () => {
        throw new Error("nope");
      },
    });
    expect(expandShortcodes("x[boom]y", reg, ctx)).toBe("xy");
  });

  test("renders empty when a registered shortcode returns a non-string", () => {
    const reg = registry({
      name: "bad",
      render: () => 42 as unknown as string,
    });
    expect(expandShortcodes("x[bad]y", reg, ctx)).toBe("xy");
  });

  test("warns in dev when a registered shortcode throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const reg = registry({
      name: "boom",
      render: () => {
        throw new Error("nope");
      },
    });
    expandShortcodes("[boom]", reg, ctx);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[boom]"),
      expect.anything(),
    );
    warn.mockRestore();
  });

  describe("named attributes", () => {
    const echoAtt = (key: string): ShortcodeSpec => ({
      name: "echo",
      render: ({ atts }) => atts[key] ?? "none",
    });

    test("parses a double-quoted attribute value into the atts map", () => {
      const reg = registry(echoAtt("sku"));
      expect(expandShortcodes('[echo sku="abc"]', reg, ctx)).toBe("abc");
    });

    test("parses a single-quoted attribute value", () => {
      const reg = registry(echoAtt("sku"));
      expect(expandShortcodes("[echo sku='abc']", reg, ctx)).toBe("abc");
    });

    test("parses a bare attribute value with no spaces", () => {
      const reg = registry(echoAtt("sku"));
      expect(expandShortcodes("[echo sku=abc]", reg, ctx)).toBe("abc");
    });

    test("a bare value with an embedded space is rejected (verbatim)", () => {
      const reg = registry(echoAtt("sku"));
      expect(expandShortcodes("[echo sku=a b]", reg, ctx)).toBe(
        "[echo sku=a b]",
      );
    });

    test("parses multiple mixed-quoting attributes", () => {
      const reg = registry({
        name: "echo",
        render: ({ atts }) => `${atts.a}-${atts.b}-${atts.c}`,
      });
      expect(expandShortcodes(`[echo a="one" b='two' c=three]`, reg, ctx)).toBe(
        "one-two-three",
      );
    });

    test("a valueless attribute is not accepted (verbatim)", () => {
      const reg = registry(echoAtt("sku"));
      expect(expandShortcodes("[echo sku]", reg, ctx)).toBe("[echo sku]");
    });

    test("a quoted value preserves spaces", () => {
      const reg = registry(echoAtt("label"));
      expect(expandShortcodes('[echo label="a b c"]', reg, ctx)).toBe("a b c");
    });
  });
});
