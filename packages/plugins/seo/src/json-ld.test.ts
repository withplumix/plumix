import { describe, expect, test } from "vitest";

import { serializeJsonLd } from "./json-ld.js";

describe("serializeJsonLd", () => {
  test("round-trips as JSON", () => {
    const value = { a: 1, b: ["x", null], c: { d: true } };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });

  test("a hostile string cannot close the script element", () => {
    const title = '</script><script>alert("xss")</script>';
    const out = serializeJsonLd({ headline: title });

    expect(out).not.toContain("</script");
    expect(out).not.toContain("<script");
    expect(out).toContain("\\u003C");
    // Escaped for the tokenizer, unchanged for the reader.
    expect(JSON.parse(out)).toEqual({ headline: title });
  });

  test("line and paragraph separators are escaped", () => {
    // Legal in a JSON string, a hard parse error in a script body.
    const text = "a\u2028b\u2029c";
    const out = serializeJsonLd({ text });

    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(JSON.parse(out)).toEqual({ text });
  });

  test("ampersands are escaped too", () => {
    const out = serializeJsonLd({ name: "Ben & Jerry" });

    expect(out).not.toContain("&");
    expect(JSON.parse(out)).toEqual({ name: "Ben & Jerry" });
  });
});
