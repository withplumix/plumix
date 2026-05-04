import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../manifest.js";
import {
  RepeaterValidationError,
  walkRepeaterRows,
} from "./repeater-validate.js";

// Minimal subfield builder — full builder helpers live in `text.ts`
// etc., but tests only need the shape (`key`, `inputType`, `type`,
// optional `sanitize`). Building inline keeps tests self-contained
// and lets each suite assert exactly the sanitize behavior it wants.
function stubField(opts: {
  key: string;
  inputType?: string;
  sanitize?: (v: unknown) => unknown;
}): MetaBoxField {
  return {
    key: opts.key,
    label: opts.key,
    type: "string",
    inputType: opts.inputType ?? "text",
    sanitize: opts.sanitize,
  };
}

describe("walkRepeaterRows — passthrough", () => {
  test("null and undefined pass through unchanged", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeUndefined();
  });

  test("returns a fresh array — doesn't mutate input", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    const input = [{ x: "a" }];
    const out = validate(input) as unknown[];
    expect(out).not.toBe(input);
    expect(out).toEqual([{ x: "a" }]);
  });
});

describe("walkRepeaterRows — empty-row stripping", () => {
  test("drops rows where every declared subfield is null/undefined/empty", () => {
    const validate = walkRepeaterRows([
      stubField({ key: "label" }),
      stubField({ key: "href" }),
    ]);
    const out = validate([
      { label: "First", href: "/" },
      { label: "", href: null },
      { label: "Second", href: "/two" },
      {},
    ]);
    expect(out).toEqual([
      { label: "First", href: "/" },
      { label: "Second", href: "/two" },
    ]);
  });

  test("a row with at least one non-empty subfield survives", () => {
    const validate = walkRepeaterRows([
      stubField({ key: "label" }),
      stubField({ key: "href" }),
    ]);
    const out = validate([{ label: "Just a label", href: "" }]);
    expect(out).toEqual([{ label: "Just a label", href: "" }]);
  });

  test("strips extraneous keys not declared in subFields", () => {
    const validate = walkRepeaterRows([stubField({ key: "label" })]);
    const out = validate([{ label: "x", smuggled: "should not survive" }]);
    expect(out).toEqual([{ label: "x" }]);
  });
});

describe("walkRepeaterRows — min / max enforcement", () => {
  test("below min throws below_min after stripping", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })], { min: 2 });
    expect(() => validate([{ x: "a" }, { x: "" }])).toThrow(
      RepeaterValidationError,
    );
    try {
      validate([{ x: "a" }, { x: "" }]);
    } catch (err) {
      expect((err as RepeaterValidationError).reason).toBe("below_min");
    }
  });

  test("above max throws above_max", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })], { max: 1 });
    expect(() => validate([{ x: "a" }, { x: "b" }])).toThrow(
      RepeaterValidationError,
    );
    try {
      validate([{ x: "a" }, { x: "b" }]);
    } catch (err) {
      expect((err as RepeaterValidationError).reason).toBe("above_max");
    }
  });

  test("min counts only non-empty rows (stripped rows don't count)", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })], { min: 1 });
    expect(() => validate([{ x: "" }, {}])).toThrow(RepeaterValidationError);
    expect(() => validate([{ x: "real" }, {}])).not.toThrow();
  });

  test("zero rows allowed when no min set", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    expect(validate([])).toEqual([]);
  });
});

describe("walkRepeaterRows — subfield sanitize dispatch", () => {
  test("runs each subfield's sanitize callback per row", () => {
    const calls: string[] = [];
    const validate = walkRepeaterRows([
      stubField({
        key: "label",
        sanitize: (v) => {
          calls.push(`label:${String(v)}`);
          return typeof v === "string" ? v.trim() : v;
        },
      }),
    ]);
    const out = validate([{ label: "  spaced  " }, { label: "tight" }]);
    expect(out).toEqual([{ label: "spaced" }, { label: "tight" }]);
    expect(calls).toEqual(["label:  spaced  ", "label:tight"]);
  });

  test("subfield sanitize throw → subfield_invalid with row+key path", () => {
    const validate = walkRepeaterRows([
      stubField({
        key: "href",
        sanitize: (v) => {
          if (typeof v === "string" && v.startsWith("javascript:")) {
            throw new Error("unsafe scheme");
          }
          return v;
        },
      }),
    ]);
    try {
      validate([{ href: "https://ok" }, { href: "javascript:alert(1)" }]);
    } catch (err) {
      const e = err as RepeaterValidationError;
      expect(e.reason).toBe("subfield_invalid");
      expect(e.path).toBe("[1].href");
      expect(e.message).toContain("unsafe scheme");
      return;
    }
    throw new Error("expected throw");
  });

  test("missing subfield key in input passes undefined into the row (and is treated empty)", () => {
    const validate = walkRepeaterRows([
      stubField({ key: "label" }),
      stubField({ key: "href" }),
    ]);
    const out = validate([{ label: "x" }]);
    expect(out).toEqual([{ label: "x", href: undefined }]);
  });
});

describe("walkRepeaterRows — shape errors", () => {
  test("non-array root throws invalid_shape", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    expect(() => validate("nope")).toThrow(RepeaterValidationError);
    expect(() => validate({ rows: [] })).toThrow(RepeaterValidationError);
    expect(() => validate(42)).toThrow(RepeaterValidationError);
  });

  test("non-object row throws invalid_shape with [i] pointer", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    try {
      validate([{ x: "a" }, "not a row", { x: "b" }]);
    } catch (err) {
      const e = err as RepeaterValidationError;
      expect(e.reason).toBe("invalid_shape");
      expect(e.path).toBe("[1]");
      return;
    }
    throw new Error("expected throw");
  });

  test("array-shaped row rejected as invalid_shape", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    expect(() => validate([["nope"]])).toThrow(RepeaterValidationError);
  });

  test("input exceeding the hard row cap rejects with invalid_shape", () => {
    const validate = walkRepeaterRows([stubField({ key: "x" })]);
    const tooMany = Array.from({ length: 1001 }, () => ({ x: "a" }));
    expect(() => validate(tooMany)).toThrow(RepeaterValidationError);
    try {
      validate(tooMany);
    } catch (err) {
      const e = err as RepeaterValidationError;
      expect(e.reason).toBe("invalid_shape");
      expect(e.message).toMatch(/exceeds/);
    }
  });
});
