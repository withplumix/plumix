import { describe, expect, test } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import {
  decodeOptionValue,
  encodeOptionValue,
  htmlInputType,
  isAdorned,
  isBuiltinInputType,
  numberInputValue,
  orderedSelection,
  referenceValueId,
  referenceValueSummary,
  resetKeyFor,
  siblingBagName,
  temporalDisplayValue,
  temporalInputValue,
  toggleStateText,
} from "./field-values.js";

function field(
  overrides: Partial<MetaBoxFieldManifestEntry> & { inputType: string },
): MetaBoxFieldManifestEntry {
  return { key: "k", label: "Label", type: "string", ...overrides };
}

describe("numberInputValue", () => {
  test("a cleared input stores null", () => {
    expect(numberInputValue("")).toBeNull();
  });

  test("a numeric input stores the number", () => {
    expect(numberInputValue("7")).toBe(7);
  });

  test.each(["-", "1e"])(
    "partial input %j emits nothing rather than NaN",
    (raw) => {
      expect(numberInputValue(raw)).toBeUndefined();
    },
  );
});

describe("temporalInputValue", () => {
  test("a cleared input stores null", () => {
    expect(temporalInputValue("")).toBeNull();
  });

  test("the ISO string the input emits is stored as-is", () => {
    expect(temporalInputValue("2026-05-03")).toBe("2026-05-03");
  });
});

describe("temporalDisplayValue", () => {
  // UTC components: the server anchors decode/encode to UTC, so the input
  // formats with UTC getters regardless of the browser's zone.
  const value = new Date(Date.UTC(2026, 4, 3, 9, 30));

  test.each([
    ["date", "2026-05-03"],
    ["datetime", "2026-05-03T09:30"],
    ["time", "09:30"],
  ] as const)("a Date prefills a %s input as %j", (inputType, expected) => {
    expect(temporalDisplayValue(inputType, value)).toBe(expected);
  });

  test("an invalid Date shows nothing", () => {
    expect(temporalDisplayValue("date", new Date(Number.NaN))).toBe("");
  });

  test("a stored string shows unchanged", () => {
    expect(temporalDisplayValue("date", "2026-05-03")).toBe("2026-05-03");
  });
});

describe("htmlInputType", () => {
  test.each(["email", "url", "password", "date", "time"])(
    "%s keeps its native HTML input type",
    (inputType) => {
      expect(htmlInputType(inputType)).toBe(inputType);
    },
  );

  test("datetime maps to the native datetime-local input", () => {
    expect(htmlInputType("datetime")).toBe("datetime-local");
  });

  test("an unknown type falls back to a text input", () => {
    expect(htmlInputType("mystery")).toBe("text");
  });
});

describe("isBuiltinInputType", () => {
  test("password is a built-in type the text input renders", () => {
    expect(isBuiltinInputType("password")).toBe(true);
  });

  test("an unregistered plugin type is not built in", () => {
    expect(isBuiltinInputType("mystery")).toBe(false);
  });
});

describe("option values", () => {
  test("an empty-string option survives the round-trip through a Radix value", () => {
    expect(encodeOptionValue("")).not.toBe("");
    expect(decodeOptionValue(encodeOptionValue(""))).toBe("");
  });

  test("any other option value encodes unchanged", () => {
    expect(encodeOptionValue("a")).toBe("a");
  });

  test("any other option value decodes unchanged", () => {
    expect(decodeOptionValue("a")).toBe("a");
  });
});

describe("orderedSelection", () => {
  test("picked values follow the declared option order, not the pick order", () => {
    const options = [{ value: "news" }, { value: "sport" }];
    expect(orderedSelection(options, ["sport", "news"])).toEqual([
      "news",
      "sport",
    ]);
  });
});

describe("toggleStateText", () => {
  const toggle = field({
    inputType: "toggle",
    onText: "Live",
    offText: "Draft",
  });

  test("an on switch shows its on text", () => {
    expect(toggleStateText(toggle, true)).toBe("Live");
  });

  test("an off switch shows its off text", () => {
    expect(toggleStateText(toggle, false)).toBe("Draft");
  });

  test("a switch with no on/off text shows none", () => {
    expect(
      toggleStateText(field({ inputType: "toggle" }), true),
    ).toBeUndefined();
  });
});

describe("isAdorned", () => {
  test.each(["text", "email", "url", "password", "number", "textarea"])(
    "%s with a prepend or append is adorned",
    (inputType) => {
      expect(isAdorned(field({ inputType, prepend: "$" }))).toBe(true);
    },
  );

  test("a field with neither key is not adorned", () => {
    expect(isAdorned(field({ inputType: "text" }))).toBe(false);
  });

  test.each(["color", "date", "datetime", "time"])(
    "%s ignores the prepend and append it carries at runtime",
    (inputType) => {
      expect(isAdorned(field({ inputType, prepend: "$", append: "kg" }))).toBe(
        false,
      );
    },
  );
});

describe("referenceValueId", () => {
  test("a bare id is the id", () => {
    expect(referenceValueId("42")).toBe("42");
  });

  test("a hydrated value yields its id", () => {
    expect(referenceValueId({ id: "42", name: "Eva" })).toBe("42");
  });

  test.each([null, "", { id: "" }, [{ id: "42" }]])(
    "%j holds no reference",
    (value) => {
      expect(referenceValueId(value)).toBeNull();
    },
  );
});

describe("referenceValueSummary", () => {
  test("a hydrated user prefills the picker with its name", () => {
    expect(
      referenceValueSummary({
        id: "42",
        name: "Eva",
        slug: "eva",
        avatarUrl: null,
      }),
    ).toEqual({ id: "42", label: "Eva" });
  });

  test("a hydrated entry prefills the picker with its title", () => {
    expect(referenceValueSummary({ id: "7", title: "Pricing" })).toEqual({
      id: "7",
      label: "Pricing",
    });
  });

  test("each hydrated row of a multi reference prefills its own label", () => {
    expect(
      [
        { id: "1", name: "Ada" },
        { id: "2", name: "Bo" },
      ].map(referenceValueSummary),
    ).toEqual([
      { id: "1", label: "Ada" },
      { id: "2", label: "Bo" },
    ]);
  });

  test("a hydrated value with no label leaves the label to the resolve", () => {
    expect(
      referenceValueSummary({ id: "42", name: null, slug: "eva" }),
    ).toBeNull();
  });

  test("a bare id has no summary to prefill", () => {
    expect(referenceValueSummary("42")).toBeNull();
  });
});

describe("resetKeyFor", () => {
  test("a changed value changes the key", () => {
    expect(resetKeyFor("good")).not.toBe(resetKeyFor("bad"));
  });

  test("a structured value keys on its JSON", () => {
    expect(resetKeyFor({ a: 1 })).toBe('{"a":1}');
  });

  test("an unserializable value keys on a constant", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(resetKeyFor(cyclic)).toBe("__unserializable__");
  });
});

describe("siblingBagName", () => {
  test("a field in a box reads its siblings from the box's bag", () => {
    expect(siblingBagName("meta.k")).toBe("meta");
  });

  test("a field in a repeater row reads its siblings from the row", () => {
    expect(siblingBagName("links.0.label")).toBe("links.0");
  });

  test("a field at the form root reads the whole form", () => {
    expect(siblingBagName("k")).toBeUndefined();
  });
});
