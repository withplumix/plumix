import { describe, expect, test } from "vitest";

import { describeSqlParam } from "./format-param.js";

describe("describeSqlParam", () => {
  test("classifies and formats each value type", () => {
    expect(describeSqlParam("a")).toEqual({ kind: "string", text: '"a"' });
    expect(describeSqlParam(42)).toEqual({ kind: "number", text: "42" });
    expect(describeSqlParam(2n)).toEqual({ kind: "number", text: "2" });
    expect(describeSqlParam(true)).toEqual({ kind: "boolean", text: "true" });
    expect(describeSqlParam(null)).toEqual({ kind: "null", text: "null" });
    expect(describeSqlParam(undefined)).toEqual({ kind: "null", text: "null" });
    expect(describeSqlParam(new Uint8Array(3)).kind).toBe("blob");
  });

  test("quotes and truncates long strings", () => {
    const { text } = describeSqlParam("x".repeat(200));
    expect(text.length).toBeLessThan(90);
    expect(text).toContain("…");
  });
});
