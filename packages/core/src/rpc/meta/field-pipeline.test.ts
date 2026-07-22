import { describe, expect, test } from "vitest";

import {
  color,
  date,
  email,
  link,
  number,
  range,
  repeater,
  richtext,
  select,
  text,
  time,
  url,
} from "../../plugin/fields/index.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";
import { runFieldPipeline } from "./field-pipeline.js";

// The per-value write pipeline: coercion → `.sanitize()` → declarative
// constraints → `.validate()`. Errors carry `{ path, message }` so the
// admin form can address the offending input, including nested repeater
// cells. `null` / `undefined` inputs are deletion requests — allowed
// for optional fields, rejected for `.required()` ones (previously a
// UI-only promise).

describe("required", () => {
  test("rejects a deletion request for a required field", async () => {
    const field = text("subtitle").required().build();
    const result = await runFieldPipeline(field, null, "subtitle");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe("subtitle");
    expect(result.errors[0]?.message).toMatchObject({
      id: "metaField.required",
    });
  });

  test("treats null on an optional field as a deletion", async () => {
    const field = text("subtitle").build();
    const result = await runFieldPipeline(field, null, "subtitle");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("rejects an empty string for a required string field", async () => {
    const field = text("subtitle").required().build();
    const result = await runFieldPipeline(field, "", "subtitle");
    expect(result.errors).toEqual([
      { path: "subtitle", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("stores an empty string on an optional field", async () => {
    const field = text("subtitle").build();
    const result = await runFieldPipeline(field, "", "subtitle");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("");
  });
});

describe("coercion", () => {
  test("coerces a numeric string on a number field", async () => {
    const field = number("weight").build();
    const result = await runFieldPipeline(field, "42", "weight");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe(42);
  });

  test("uncoercible input yields a path-addressed invalid error", async () => {
    const field = number("weight").build();
    const result = await runFieldPipeline(field, "abc", "weight");
    expect(result.errors).toEqual([
      { path: "weight", message: META_FIELD_MESSAGES.invalid },
    ]);
    expect(result.value).toBeUndefined();
  });
});

describe("numeric bounds", () => {
  test("number below .min() / above .max() rejects with the bound in the message", async () => {
    const field = number("rating").min(1).max(5).build();
    const low = await runFieldPipeline(field, 0, "rating");
    expect(low.errors).toEqual([
      {
        path: "rating",
        message: { ...META_FIELD_MESSAGES.min, values: { min: 1 } },
      },
    ]);
    const high = await runFieldPipeline(field, 6, "rating");
    expect(high.errors).toEqual([
      {
        path: "rating",
        message: { ...META_FIELD_MESSAGES.max, values: { max: 5 } },
      },
    ]);
    const ok = await runFieldPipeline(field, 3, "rating");
    expect(ok.errors).toHaveLength(0);
    expect(ok.value).toBe(3);
  });

  test("range enforces its required bounds", async () => {
    const field = range("opacity").min(0).max(100).build();
    const result = await runFieldPipeline(field, 101, "opacity");
    expect(result.errors).toEqual([
      {
        path: "opacity",
        message: { ...META_FIELD_MESSAGES.max, values: { max: 100 } },
      },
    ]);
  });
});

describe("temporal format and bounds", () => {
  test("date rejects a value that is not YYYY-MM-DD", async () => {
    const field = date("publishedOn").build();
    const result = await runFieldPipeline(field, "05/03/2026", "publishedOn");
    expect(result.errors).toEqual([
      { path: "publishedOn", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("date rejects an impossible calendar date", async () => {
    const field = date("publishedOn").build();
    const result = await runFieldPipeline(field, "2026-13-45", "publishedOn");
    expect(result.errors).toEqual([
      { path: "publishedOn", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("date bounds reject values outside [min, max]", async () => {
    const field = date("publishedOn")
      .min("2026-01-01")
      .max("2026-12-31")
      .build();
    const early = await runFieldPipeline(field, "2025-12-31", "publishedOn");
    expect(early.errors).toEqual([
      {
        path: "publishedOn",
        message: {
          ...META_FIELD_MESSAGES.minTemporal,
          values: { min: "2026-01-01" },
        },
      },
    ]);
    const late = await runFieldPipeline(field, "2027-01-01", "publishedOn");
    expect(late.errors).toEqual([
      {
        path: "publishedOn",
        message: {
          ...META_FIELD_MESSAGES.maxTemporal,
          values: { max: "2026-12-31" },
        },
      },
    ]);
    const ok = await runFieldPipeline(field, "2026-06-15", "publishedOn");
    expect(ok.errors).toHaveLength(0);
    expect(ok.value).toBe("2026-06-15");
  });

  test("time accepts HH:MM and rejects out-of-range clock values", async () => {
    const field = time("opensAt").build();
    expect(
      (await runFieldPipeline(field, "09:30", "opensAt")).errors,
    ).toHaveLength(0);
    expect((await runFieldPipeline(field, "25:99", "opensAt")).errors).toEqual([
      { path: "opensAt", message: META_FIELD_MESSAGES.invalid },
    ]);
  });
});

describe("option membership and selection counts", () => {
  test("single select rejects a value outside the option list", async () => {
    const field = select("layout").options(["standard", "video"]).build();
    const result = await runFieldPipeline(field, "wide", "layout");
    expect(result.errors).toEqual([
      { path: "layout", message: META_FIELD_MESSAGES.invalidOption },
    ]);
    const ok = await runFieldPipeline(field, "video", "layout");
    expect(ok.errors).toHaveLength(0);
    expect(ok.value).toBe("video");
  });

  test("multi select rejects out-of-list items and non-arrays", async () => {
    const field = select("tags").options(["a", "b", "c"]).multiple().build();
    const bad = await runFieldPipeline(field, ["a", "z"], "tags");
    expect(bad.errors).toEqual([
      { path: "tags", message: META_FIELD_MESSAGES.invalidOption },
    ]);
    const notArray = await runFieldPipeline(field, "a", "tags");
    expect(notArray.errors).toEqual([
      { path: "tags", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("multi select de-dupes and keeps order", async () => {
    const field = select("tags").options(["a", "b", "c"]).multiple().build();
    const result = await runFieldPipeline(field, ["b", "a", "b"], "tags");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual(["b", "a"]);
  });

  test("multi select enforces .max() selection count", async () => {
    const field = select("tags")
      .options(["a", "b", "c"])
      .multiple()
      .max(2)
      .build();
    const result = await runFieldPipeline(field, ["a", "b", "c"], "tags");
    expect(result.errors).toEqual([
      {
        path: "tags",
        message: { ...META_FIELD_MESSAGES.maxItems, values: { max: 2 } },
      },
    ]);
  });
});

describe("format checks", () => {
  test("email rejects a malformed address", async () => {
    const field = email("contact").build();
    const bad = await runFieldPipeline(field, "not-an-email", "contact");
    expect(bad.errors).toEqual([
      { path: "contact", message: META_FIELD_MESSAGES.invalidEmail },
    ]);
    const ok = await runFieldPipeline(field, "a@b.co", "contact");
    expect(ok.errors).toHaveLength(0);
  });

  test("url accepts safe absolute and relative forms, rejects script schemes", async () => {
    const field = url("website").build();
    expect(
      (await runFieldPipeline(field, "https://example.com", "website")).errors,
    ).toHaveLength(0);
    expect(
      (await runFieldPipeline(field, "/pricing", "website")).errors,
    ).toHaveLength(0);
    expect(
      // eslint-disable-next-line no-script-url -- asserting the reject path
      (await runFieldPipeline(field, "javascript:alert(1)", "website")).errors,
    ).toEqual([{ path: "website", message: META_FIELD_MESSAGES.invalidUrl }]);
  });

  test("color enforces #rrggbb and lowercases", async () => {
    const field = color("accent").build();
    const result = await runFieldPipeline(field, "#A1B2C3", "accent");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("#a1b2c3");
    const bad = await runFieldPipeline(field, "red", "accent");
    expect(bad.errors).toEqual([
      { path: "accent", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("link validates shape and URL, dropping unknown keys", async () => {
    const field = link("cta").build();
    const result = await runFieldPipeline(
      field,
      { url: "/pricing", label: "See pricing", extra: "nope" },
      "cta",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual({ url: "/pricing", label: "See pricing" });
    const bad = await runFieldPipeline(
      field,
      // eslint-disable-next-line no-script-url -- asserting the reject path
      { url: "javascript:alert(1)" },
      "cta",
    );
    expect(bad.errors).toEqual([
      { path: "cta", message: META_FIELD_MESSAGES.invalid },
    ]);
  });
});

describe("repeater rows", () => {
  const sections = repeater({
    key: "sections",
    label: "Sections",
    subFields: [
      text("heading").required().maxLength(10),
      number("weight").min(1),
    ],
  });

  test("subfield constraint errors carry the row-indexed path", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ heading: "ok" }, { heading: "way too long for this" }],
      "sections",
    );
    expect(result.errors).toEqual([
      {
        path: "sections.1.heading",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 10 } },
      },
    ]);
  });

  test("a required subfield left empty in a non-empty row errors at its cell", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ heading: "", weight: 5 }],
      "sections",
    );
    expect(result.errors).toEqual([
      { path: "sections.0.heading", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("blank rows are stripped, keep original indices in error paths, and coerce cells", async () => {
    const result = await runFieldPipeline(
      sections,
      [
        { heading: "", weight: null },
        { heading: "fine", weight: "0" },
      ],
      "sections",
    );
    // Row 0 is blank — stripped, not validated. Row 1 keeps its
    // original index in the error path even after the strip.
    expect(result.errors).toEqual([
      {
        path: "sections.1.weight",
        message: { ...META_FIELD_MESSAGES.min, values: { min: 1 } },
      },
    ]);
  });

  test("stores stripped, coerced rows when everything passes", async () => {
    const result = await runFieldPipeline(
      sections,
      [
        { heading: "", weight: null },
        { heading: "fine", weight: "2" },
      ],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([{ heading: "fine", weight: 2 }]);
  });

  test("row-count bounds are enforced after the strip", async () => {
    const bounded = repeater({
      key: "faq",
      label: "FAQ",
      subFields: [text("q")],
      min: 1,
      max: 2,
    });
    const under = await runFieldPipeline(bounded, [{ q: "" }], "faq");
    expect(under.errors).toEqual([
      {
        path: "faq",
        message: { ...META_FIELD_MESSAGES.minRows, values: { min: 1 } },
      },
    ]);
    const over = await runFieldPipeline(
      bounded,
      [{ q: "a" }, { q: "b" }, { q: "c" }],
      "faq",
    );
    expect(over.errors).toEqual([
      {
        path: "faq",
        message: { ...META_FIELD_MESSAGES.maxRows, values: { max: 2 } },
      },
    ]);
  });

  test("a non-array value is invalid at the repeater path", async () => {
    const result = await runFieldPipeline(sections, "nope", "sections");
    expect(result.errors).toEqual([
      { path: "sections", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("errors aggregate across rows and cells", async () => {
    const result = await runFieldPipeline(
      sections,
      [
        { heading: "way too long for this", weight: 0 },
        { heading: "", weight: 3 },
      ],
      "sections",
    );
    expect(result.errors.map((e) => e.path)).toEqual([
      "sections.0.heading",
      "sections.0.weight",
      "sections.1.heading",
    ]);
  });
});

describe("richtext allowlists", () => {
  test("a disallowed mark rejects at the field path", async () => {
    const field = richtext("body").marks(["bold"]).build();
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi", marks: [{ type: "italic" }] }],
        },
      ],
    };
    const result = await runFieldPipeline(field, doc, "body");
    expect(result.errors).toEqual([
      { path: "body", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("an allowlisted doc passes through", async () => {
    const field = richtext("body").marks(["bold"]).build();
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }],
        },
      ],
    };
    const result = await runFieldPipeline(field, doc, "body");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual(doc);
  });
});

describe(".validate()", () => {
  test("a returned message becomes a path-addressed error", async () => {
    const field = text("slug")
      .validate((value) => (value.startsWith("x") ? true : "Must start with x"))
      .build();
    const result = await runFieldPipeline(field, "abc", "slug");
    expect(result.errors).toEqual([
      { path: "slug", message: "Must start with x" },
    ]);
  });

  test("async validators resolve and pass valid values through", async () => {
    const field = text("slug")
      .validate((value) =>
        Promise.resolve(value === "taken" ? "Already in use" : true),
      )
      .build();
    const ok = await runFieldPipeline(field, "fresh", "slug");
    expect(ok.errors).toHaveLength(0);
    expect(ok.value).toBe("fresh");
    const bad = await runFieldPipeline(field, "taken", "slug");
    expect(bad.errors).toEqual([{ path: "slug", message: "Already in use" }]);
  });

  test("runs after declarative constraints and is skipped when they fail", async () => {
    let called = false;
    const field = text("slug")
      .maxLength(3)
      .validate(() => {
        called = true;
        return true;
      })
      .build();
    const result = await runFieldPipeline(field, "too-long", "slug");
    expect(result.errors).toHaveLength(1);
    expect(called).toBe(false);
  });

  test("a throwing validator becomes a generic invalid error", async () => {
    const field = text("slug")
      .validate(() => {
        throw new Error("boom");
      })
      .build();
    const result = await runFieldPipeline(field, "x", "slug");
    expect(result.errors).toEqual([
      { path: "slug", message: META_FIELD_MESSAGES.invalid },
    ]);
  });
});

describe(".sanitize()", () => {
  test("receives the coerced value and its return value persists", async () => {
    const field = text("slug")
      .sanitize((value) => value.trim().toLowerCase())
      .build();
    const result = await runFieldPipeline(field, "  Hello  ", "slug");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("hello");
  });

  test("a throwing sanitize callback becomes a path-addressed invalid error", async () => {
    const field = text("slug")
      .sanitize(() => {
        throw new Error("nope");
      })
      .build();
    const result = await runFieldPipeline(field, "x", "slug");
    expect(result.errors).toEqual([
      { path: "slug", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("a transform cannot smuggle a value past the shape gates", async () => {
    // The link URL gate re-runs on the sanitize output — a callback
    // returning a script-bearing URL must not persist.
    const cta = link("cta")
      // eslint-disable-next-line no-script-url -- asserting the reject path
      .sanitize((value) => ({ ...value, url: "javascript:alert(1)" }))
      .build();
    const smuggled = await runFieldPipeline(cta, { url: "/ok" }, "cta");
    expect(smuggled.errors).toEqual([
      { path: "cta", message: META_FIELD_MESSAGES.invalid },
    ]);
    // A multi-select sanitize returning a non-array degrades to a
    // path-addressed invalid, not an unhandled TypeError.
    const tags = select("tags")
      .options(["a", "b"])
      .multiple()
      .sanitize(() => "a" as unknown as readonly ("a" | "b")[])
      .build();
    const notArray = await runFieldPipeline(tags, ["a"], "tags");
    expect(notArray.errors).toEqual([
      { path: "tags", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("declarative constraints run on the sanitized value", async () => {
    // Sanitize pads beyond maxLength — the constraint must see the
    // padded value and reject, proving the order is sanitize-first.
    const field = text("slug")
      .maxLength(5)
      .sanitize((value) => value.padEnd(10, "x"))
      .build();
    const result = await runFieldPipeline(field, "ab", "slug");
    expect(result.errors).toEqual([
      {
        path: "slug",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 5 } },
      },
    ]);
  });
});
