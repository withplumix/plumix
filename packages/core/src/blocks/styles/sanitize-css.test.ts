import { describe, expect, test } from "vitest";

import { sanitizeCssValue } from "./sanitize-css.js";

describe("sanitizeCssValue", () => {
  test("passes through ordinary CSS values", () => {
    expect(sanitizeCssValue("16px")).toBe("16px");
    expect(sanitizeCssValue("#0c2238")).toBe("#0c2238");
    expect(sanitizeCssValue("rgba(0, 0, 0, 0.5)")).toBe("rgba(0, 0, 0, 0.5)");
    expect(sanitizeCssValue("  1.5rem  ")).toBe("1.5rem");
  });

  test("rejects rule/breakout and script-injection vectors", () => {
    // Brace breakout out of the declaration block.
    expect(sanitizeCssValue("red } body { display:none")).toBeNull();
    // Legacy IE expression() script execution.
    expect(sanitizeCssValue("expression(alert(1))")).toBeNull();
    // javascript: scheme (e.g. inside url()).
    expect(sanitizeCssValue("url(javascript:alert(1))")).toBeNull();
    // Tag / escape obfuscation vectors.
    expect(sanitizeCssValue("</style><script>")).toBeNull();
    expect(sanitizeCssValue("\\65 xpression(1)")).toBeNull();
  });

  test("rejects empty / non-string input", () => {
    expect(sanitizeCssValue("")).toBeNull();
    expect(sanitizeCssValue("   ")).toBeNull();
  });
});
