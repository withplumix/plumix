import { describe, expect, test } from "vitest";

import {
  color,
  date,
  email,
  group,
  json,
  link,
  number,
  range,
  repeater,
  richtext,
  select,
  text,
  time,
  toggle,
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

// Draft mode (autosave) tolerates not-yet-valid content so a
// work-in-progress save never fails: business-rule constraints
// (required, min/max, maxLength, option membership, format, row counts,
// `.validate()`) are skipped. Structural/security gates (coercion,
// shape, url safe-href, temporal validity, `.sanitize()`) still run so
// a draft can never hold corrupt or unsafe data. `strict` is the
// default and enforces everything.
describe("draft mode", () => {
  test("keeps an empty required field instead of erroring", async () => {
    const field = text("subtitle").required().build();
    const result = await runFieldPipeline(field, "", "subtitle", "draft");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("");
  });

  test("treats a null required field as a deletion, not an error", async () => {
    const field = text("subtitle").required().build();
    const result = await runFieldPipeline(field, null, "subtitle", "draft");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("skips numeric bounds", async () => {
    const field = number("rating").min(1).max(5).build();
    const result = await runFieldPipeline(field, 99, "rating", "draft");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe(99);
  });

  test("skips maxLength", async () => {
    const field = text("tagline").maxLength(3).build();
    const result = await runFieldPipeline(
      field,
      "way too long",
      "tag",
      "draft",
    );
    expect(result.errors).toHaveLength(0);
  });

  test("skips select option membership", async () => {
    const field = select("style").options(["card", "banner"]).build();
    const result = await runFieldPipeline(field, "nonsense", "style", "draft");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("nonsense");
  });

  test("skips email format", async () => {
    const field = email("contact").build();
    const result = await runFieldPipeline(field, "not-an-email", "c", "draft");
    expect(result.errors).toHaveLength(0);
  });

  test("skips temporal bounds but still rejects an invalid date shape", async () => {
    const bounded = date("publishOn").min("2026-01-01").build();
    const early = await runFieldPipeline(bounded, "2020-01-01", "d", "draft");
    expect(early.errors).toHaveLength(0);

    const garbage = await runFieldPipeline(bounded, "not-a-date", "d", "draft");
    expect(garbage.errors).toEqual([
      { path: "d", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("still rejects uncoercible input", async () => {
    const field = number("weight").build();
    const result = await runFieldPipeline(field, "abc", "weight", "draft");
    expect(result.errors).toEqual([
      { path: "weight", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("still hard-fails a script-bearing url (security gate)", async () => {
    const field = url("homepage").build();
    const result = await runFieldPipeline(
      field,
      "javascript:alert(1)",
      "homepage",
      "draft",
    );
    expect(result.errors).toEqual([
      { path: "homepage", message: META_FIELD_MESSAGES.invalidUrl },
    ]);
  });

  test("skips repeater min/max row counts but recurses cell structure", async () => {
    const field = repeater("sections")
      .fields([text("heading").required(), number("cols")])
      .min(2)
      .max(3)
      .build();
    // One row (below min) with an empty required cell — both are business
    // rules, so draft tolerates them...
    const lenient = await runFieldPipeline(
      field,
      [{ heading: "", cols: 2 }],
      "sections",
      "draft",
    );
    expect(lenient.errors).toHaveLength(0);
    // ...but a cell with an uncoercible value is structural and still fails.
    const structural = await runFieldPipeline(
      field,
      [{ heading: "Intro", cols: "abc" }],
      "sections",
      "draft",
    );
    expect(structural.errors).toEqual([
      { path: "sections.0.cols", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("strict mode (the default) still enforces every constraint", async () => {
    const field = number("rating").min(1).max(5).build();
    expect(
      (await runFieldPipeline(field, 99, "rating", "strict")).errors,
    ).toHaveLength(1);
    expect((await runFieldPipeline(field, 99, "rating")).errors).toHaveLength(
      1,
    );
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
    const field = range("opacity").bounds(0, 100).build();
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
      { url: "javascript:alert(1)" },
      "cta",
    );
    expect(bad.errors).toEqual([
      { path: "cta", message: META_FIELD_MESSAGES.invalid },
    ]);
  });
});

describe("repeater rows", () => {
  const sections = repeater("sections")
    .fields([text("heading").required().maxLength(10), number("weight").min(1)])
    .label("Sections")
    .build();

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
    const bounded = repeater("faq")
      .fields([text("q")])
      .label("FAQ")
      .min(1)
      .max(2)
      .build();
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

  test("an emptied repeater deletes its key rather than storing an empty list", async () => {
    // Matches the group, whose all-blank value has always been a deletion.
    const result = await runFieldPipeline(
      sections,
      [{ heading: "" }],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
    expect(result.value).toBeUndefined();
  });

  test("a min without a required still rejects an emptied repeater", async () => {
    // `.min()` is a real constraint even though the field is optional, so
    // the deletion short-circuit must not run ahead of the count bounds.
    const bounded = repeater("faq")
      .fields([text("q")])
      .min(1)
      .build();
    const result = await runFieldPipeline(bounded, [{ q: "" }], "faq");
    expect(result.errors).toEqual([
      {
        path: "faq",
        message: { ...META_FIELD_MESSAGES.minRows, values: { min: 1 } },
      },
    ]);
    expect(result.isDeletion).toBeUndefined();
  });

  test("a draft save of an emptied repeater deletes without running bounds", async () => {
    const bounded = repeater("faq")
      .fields([text("q")])
      .min(1)
      .build();
    const result = await runFieldPipeline(bounded, [{ q: "" }], "faq", "draft");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("a non-array value is invalid at the repeater path", async () => {
    const result = await runFieldPipeline(sections, "nope", "sections");
    expect(result.errors).toEqual([
      { path: "sections", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("a composite .validate() sees the assembled post-strip rows", async () => {
    const seen: unknown[] = [];
    const unique = repeater("faq")
      .fields([text("q")])
      .validate((rows) => {
        seen.push(rows);
        return true;
      })
      .build();
    const result = await runFieldPipeline(
      unique,
      [{ q: "a" }, { q: "" }, { q: "b" }],
      "faq",
    );
    expect(result.errors).toHaveLength(0);
    // The blank row is gone before the validator runs — a cross-row rule
    // reasons about the rows that will be stored, not the ones typed.
    expect(seen).toEqual([[{ q: "a" }, { q: "b" }]]);
  });

  test("a composite .validate() rejection anchors on the repeater's own path", async () => {
    const unique = repeater("faq")
      .fields([text("q")])
      .validate((rows) =>
        new Set(rows.map((r) => r.q)).size === rows.length
          ? true
          : "Questions must be unique",
      )
      .build();
    const result = await runFieldPipeline(
      unique,
      [{ q: "a" }, { q: "a" }],
      "faq",
    );
    expect(result.errors).toEqual([
      { path: "faq", message: "Questions must be unique" },
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

describe("composite hooks on groups", () => {
  test("a group .validate() sees the assembled members", async () => {
    const seen: unknown[] = [];
    const seo = group("seo")
      .fields([text("title"), text("slug")])
      .validate((members) => {
        seen.push(members);
        return true;
      })
      .build();
    const result = await runFieldPipeline(
      seo,
      { title: "Hello", slug: "hello" },
      "seo",
    );
    expect(result.errors).toHaveLength(0);
    expect(seen).toEqual([{ title: "Hello", slug: "hello" }]);
  });

  test("a group .validate() rejection anchors on the group's own path", async () => {
    const range_ = group("window")
      .fields([number("from"), number("to")])
      .validate((w) =>
        (w.from ?? 0) <= (w.to ?? 0) ? true : "From must not exceed to",
      )
      .build();
    const result = await runFieldPipeline(range_, { from: 9, to: 4 }, "window");
    expect(result.errors).toEqual([
      { path: "window", message: "From must not exceed to" },
    ]);
  });

  test("a group .sanitize() reshapes the assembled members", async () => {
    const seo = group("seo")
      .fields([text("title"), text("slug")])
      .sanitize((members) => ({
        ...members,
        slug: members.title?.toLowerCase() ?? "",
      }))
      .build();
    const result = await runFieldPipeline(seo, { title: "Hello" }, "seo");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual({ title: "Hello", slug: "hello" });
  });
});

describe("composite .sanitize() output is structurally re-checked", () => {
  const faq = (
    sanitize: (rows: readonly { q: string | undefined }[]) => unknown,
  ) =>
    repeater("faq")
      .fields([text("q").maxLength(5)])
      // Deliberately untyped at the seam: the re-check exists for callers
      // whose sanitizer does not honour the declared return type.
      .sanitize(
        sanitize as (rows: readonly { q: string | undefined }[]) => never,
      )
      .build();

  test("a non-array return is rejected at the repeater's own path", async () => {
    const result = await runFieldPipeline(
      faq(() => ({ nope: true })),
      [{ q: "a" }],
      "faq",
    );
    expect(result.errors).toEqual([
      { path: "faq", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("a row carrying an undeclared key is rejected", async () => {
    const result = await runFieldPipeline(
      faq((rows) => rows.map((r) => ({ ...r, smuggled: 1 }))),
      [{ q: "a" }],
      "faq",
    );
    expect(result.errors).toEqual([
      { path: "faq", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("cells are not re-walked — rearranging rows is the contract, authoring cells is not", async () => {
    const result = await runFieldPipeline(
      faq((rows) => [...rows].reverse()),
      [{ q: "a" }, { q: "b" }],
      "faq",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([{ q: "b" }, { q: "a" }]);
  });

  test("a throwing sanitizer rounds to invalid at the composite path", async () => {
    const result = await runFieldPipeline(
      faq(() => {
        throw new Error("boom");
      }),
      [{ q: "a" }],
      "faq",
    );
    expect(result.errors).toEqual([
      { path: "faq", message: META_FIELD_MESSAGES.invalid },
    ]);
  });
});

describe("a composite .sanitize() cannot smuggle a value past a cell's gates", () => {
  test("a member copied into a url cell still clears the safe-href gate", async () => {
    // The scalar path re-runs the security gates on its sanitizer's
    // output; a composite that writes into a member must not be the way
    // around them. `raw` is a plain text cell, so it accepts anything.
    const cta = group("cta")
      .fields([text("raw"), url("href")])
      .sanitize((m) => ({ ...m, href: m.raw ?? "" }))
      .build();
    const result = await runFieldPipeline(
      cta,
      { raw: "javascript:alert(document.cookie)" },
      "cta",
    );
    expect(result.errors).toEqual([
      { path: "cta.href", message: META_FIELD_MESSAGES.invalidUrl },
    ]);
  });

  test("a de-dupe that drops below .min() is rejected, not silently stored", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .min(2)
      .sanitize((rows) => [...new Map(rows.map((r) => [r.v, r])).values()])
      .build();
    const result = await runFieldPipeline(
      tags,
      [{ v: "a" }, { v: "a" }, { v: "a" }],
      "tags",
    );
    expect(result.errors).toEqual([
      {
        path: "tags",
        message: { ...META_FIELD_MESSAGES.minRows, values: { min: 2 } },
      },
    ]);
  });

  test("a sanitizer may trim down to .max() — the bounds judge what it returned", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .max(2)
      .sanitize((rows) => rows.slice(0, 2))
      .build();
    const result = await runFieldPipeline(
      tags,
      [{ v: "a" }, { v: "b" }, { v: "c" }],
      "tags",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([{ v: "a" }, { v: "b" }]);
  });

  test("a sanitizer may pad up to .min()", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .min(2)
      .sanitize((rows) => [...rows, { v: "pad" }])
      .build();
    const result = await runFieldPipeline(tags, [{ v: "a" }], "tags");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([{ v: "a" }, { v: "pad" }]);
  });

  test("a cell rejected after a reorder anchors on the repeater, not a moved index", async () => {
    // Post-sanitize row positions no longer address anything the admin
    // rendered, so pointing at one would highlight the wrong row and show
    // the author a valid value.
    const links = repeater("links")
      .fields([text("raw"), url("href")])
      .sanitize((rows) =>
        [...rows].reverse().map((r) => ({ ...r, href: r.raw })),
      )
      .build();
    const result = await runFieldPipeline(
      links,
      [{ raw: "javascript:alert(1)" }, { raw: "https://ok.example" }],
      "links",
    );
    expect(result.errors).toEqual([
      { path: "links", message: META_FIELD_MESSAGES.invalidUrl },
    ]);
  });

  test("a blank row the sanitizer appends is stripped, not stored", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .sanitize((rows) => [...rows, {}])
      .build();
    const result = await runFieldPipeline(tags, [{ v: "a" }], "tags");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([{ v: "a" }]);
  });
});

describe("a composite .sanitize() clears the field by returning it empty", () => {
  test("a repeater sanitizer returning no rows deletes the key", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .sanitize(() => [])
      .build();
    const result = await runFieldPipeline(tags, [{ v: "a" }], "tags");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("a group sanitizer returning no members deletes the key", async () => {
    const seo = group("seo")
      .fields([text("title")])
      .sanitize(() => ({}))
      .build();
    const result = await runFieldPipeline(seo, { title: "x" }, "seo");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("clearing a required group is rejected, exactly as for a repeater", async () => {
    const seo = group("seo")
      .fields([text("title")])
      .required()
      .sanitize(() => ({}))
      .build();
    const result = await runFieldPipeline(seo, { title: "x" }, "seo");
    expect(result.errors).toEqual([
      { path: "seo", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("clearing a required composite is still rejected", async () => {
    const tags = repeater("tags")
      .fields([text("v")])
      .required()
      .sanitize(() => [])
      .build();
    const result = await runFieldPipeline(tags, [{ v: "a" }], "tags");
    expect(result.errors).toEqual([
      { path: "tags", message: META_FIELD_MESSAGES.required },
    ]);
  });
});

describe("composite hooks nested inside one another", () => {
  test("a hidden inner group's rule is skipped while the outer repeater's still runs", async () => {
    // `cellMode` drops a condition-hidden cell to draft so a business
    // rule can't fail on an input nobody can open. The inner group is
    // that cell; the outer repeater is not, so it still runs strict and
    // receives the very cell whose own rule was skipped. That mixed trust
    // is the documented consequence of the hook, pinned here.
    const inner: unknown[] = [];
    const outer: unknown[] = [];
    const rows = repeater("sections")
      .fields([
        select("kind").options(["hero", "plain"]),
        group("hero")
          .fields([text("headline")])
          .visibleWhen({ key: "kind", op: "eq", value: "hero" })
          .validate((members) => {
            inner.push(members);
            return "the inner rule always fails";
          }),
      ])
      .validate((assembled) => {
        outer.push(assembled);
        return true;
      })
      .build();
    const result = await runFieldPipeline(
      rows,
      [{ kind: "plain", hero: { headline: "left over" } }],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
    expect(inner).toEqual([]);
    expect(outer).toEqual([
      [{ kind: "plain", hero: { headline: "left over" } }],
    ]);
  });

  test("a visible inner group's rule reports at its own nested path", async () => {
    const rows = repeater("sections")
      .fields([
        select("kind").options(["hero", "plain"]),
        group("hero")
          .fields([text("headline")])
          .visibleWhen({ key: "kind", op: "eq", value: "hero" })
          .validate(() => "Headline reads badly"),
      ])
      .build();
    const result = await runFieldPipeline(
      rows,
      [{ kind: "hero", hero: { headline: "x" } }],
      "sections",
    );
    expect(result.errors).toEqual([
      { path: "sections.0.hero", message: "Headline reads badly" },
    ]);
  });
});

describe("when composite hooks are skipped", () => {
  const spyRepeater = (calls: unknown[]) =>
    repeater("faq")
      .fields([text("q").required().maxLength(5)])
      .validate((rows) => {
        calls.push(rows);
        return true;
      });

  test("not run when a cell failed — the rule would be reading garbage", async () => {
    const calls: unknown[] = [];
    const result = await runFieldPipeline(
      spyRepeater(calls).build(),
      [{ q: "way too long" }],
      "faq",
    );
    expect(result.errors).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  test("not run on a draft save — a cross-row rule is a business rule", async () => {
    const calls: unknown[] = [];
    const result = await runFieldPipeline(
      spyRepeater(calls).build(),
      [{ q: "ok" }],
      "faq",
      "draft",
    );
    expect(result.errors).toHaveLength(0);
    expect(calls).toEqual([]);
  });

  test("a repeater .sanitize() is not run on the deletion path either", async () => {
    const calls: unknown[] = [];
    const tags = repeater("tags")
      .fields([text("v")])
      .sanitize((rows) => {
        calls.push(rows);
        return rows;
      })
      .build();
    const result = await runFieldPipeline(tags, [{ v: "" }], "tags");
    expect(result.isDeletion).toBe(true);
    expect(calls).toEqual([]);
  });

  test("not run when the composite resolves to a deletion", async () => {
    const calls: unknown[] = [];
    const seo = group("seo")
      .fields([text("title")])
      .validate((members) => {
        calls.push(members);
        return true;
      })
      .build();
    const result = await runFieldPipeline(seo, { title: "" }, "seo");
    expect(result.isDeletion).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("condition-hidden cells", () => {
  const kind = select("kind").options(["text", "select"]);
  const sections = repeater("sections")
    .fields([
      text("title"),
      kind,
      text("choices").required().maxLength(3).visibleWhen(kind.is("select")),
    ])
    .label("Sections")
    .build();

  test("a hidden required cell doesn't block the row", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ title: "x", kind: "text", choices: "" }],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
  });

  test("a hidden cell keeps its value and skips business rules", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ title: "x", kind: "text", choices: "far too long for maxLength 3" }],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual([
      { title: "x", kind: "text", choices: "far too long for maxLength 3" },
    ]);
  });

  test("a hidden cell still clears the structural gates", async () => {
    const link = repeater("links")
      .fields([kind, url("href").visibleWhen(kind.is("select"))])
      .label("Links")
      .build();
    const result = await runFieldPipeline(
      link,
      [{ kind: "text", href: "javascript:alert(1)" }],
      "links",
    );
    // Hidden means "no business rules", not "unchecked" — a script-bearing
    // href is refused wherever it sits, exactly as in draft mode.
    expect(result.errors).toEqual([
      { path: "links.0.href", message: META_FIELD_MESSAGES.invalidUrl },
    ]);
  });

  test("a visible cell is validated as usual", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ title: "x", kind: "select", choices: "" }],
      "sections",
    );
    expect(result.errors).toEqual([
      { path: "sections.0.choices", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("a stored row missing its driver reads the condition as unmet", async () => {
    // An unset driver cell leaves no key behind, so the stored row carries
    // no `kind` at all. A row is always written whole, so that absence means
    // "unset" — read as "unknown driver" it would validate a cell the admin
    // hides and block the publish at a path with no input to open.
    const result = await runFieldPipeline(
      sections,
      [{ title: "x" }],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
  });

  test("a hidden cell survives a publish that rewrites the stored row", async () => {
    const stored = [{ title: "x", kind: "text", choices: "keep me" }];
    const first = await runFieldPipeline(sections, stored, "sections");
    const republished = await runFieldPipeline(
      sections,
      first.value,
      "sections",
    );
    expect(republished.value).toEqual(stored);
  });

  test("a row is not blank while a hidden cell holds a value", async () => {
    const result = await runFieldPipeline(
      sections,
      [{ title: "", kind: null, choices: "still mine" }],
      "sections",
    );
    expect(result.value).toEqual([{ title: "", choices: "still mine" }]);
  });

  test("a group's hidden member keeps its value and never blocks the group", async () => {
    const hasCta = toggle("hasCta");
    const cta = group("cta")
      .fields([hasCta, url("ctaUrl").required().visibleWhen(hasCta.isOn())])
      .label("CTA")
      .build();
    const result = await runFieldPipeline(
      cta,
      { hasCta: false, ctaUrl: "https://example.com/old" },
      "cta",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual({
      hasCta: false,
      ctaUrl: "https://example.com/old",
    });
  });
});

describe("nested repeaters", () => {
  const outer = repeater("sections")
    .fields([
      text("heading").required(),
      repeater("callouts").fields([text("tone").required().maxLength(5)]),
    ])
    .build();

  test("a constraint deep in a nested row carries its full path", async () => {
    const result = await runFieldPipeline(
      outer,
      [{ heading: "Intro", callouts: [{ tone: "way too long" }] }],
      "sections",
    );
    expect(result.errors).toEqual([
      {
        path: "sections.0.callouts.0.tone",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 5 } },
      },
    ]);
  });

  test("stores the recursively stripped + coerced nested structure", async () => {
    const result = await runFieldPipeline(
      outer,
      [
        {
          heading: "Intro",
          callouts: [{ tone: "warm" }, { tone: "" }],
        },
      ],
      "sections",
    );
    expect(result.errors).toHaveLength(0);
    // The blank nested row is stripped; the kept one is coerced.
    expect(result.value).toEqual([
      { heading: "Intro", callouts: [{ tone: "warm" }] },
    ]);
  });
});

describe("group members", () => {
  const seo = group("seo")
    .fields([text("title").required().maxLength(5), text("description")])
    .build();

  test("stores a nested object keyed by member field (no flattening)", async () => {
    const result = await runFieldPipeline(
      seo,
      { title: "Hi", description: "About" },
      "seo",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.value).toEqual({ title: "Hi", description: "About" });
  });

  test("member constraint errors carry the group-scoped path", async () => {
    const result = await runFieldPipeline(
      seo,
      { title: "way too long" },
      "seo",
    );
    expect(result.errors).toEqual([
      {
        path: "seo.title",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 5 } },
      },
    ]);
  });

  test("an all-empty optional group is dropped (a deletion)", async () => {
    const optional = group("meta")
      .fields([text("a"), text("b")])
      .build();
    const result = await runFieldPipeline(optional, { a: "", b: null }, "meta");
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("a blank optional group is dropped even with a required member", async () => {
    // Regression: the all-empty strip must run before member validation,
    // or a required member makes an untouched optional group impossible
    // to clear — the same trap the repeater avoids by stripping blank
    // rows first.
    const withRequired = group("meta")
      .fields([text("a").required(), text("b")])
      .build();
    const result = await runFieldPipeline(
      withRequired,
      { a: "", b: "" },
      "meta",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.isDeletion).toBe(true);
  });

  test("a required member left empty in a populated group still errors", async () => {
    const withRequired = group("meta")
      .fields([text("a").required(), text("b")])
      .build();
    const result = await runFieldPipeline(
      withRequired,
      { a: "", b: "filled" },
      "meta",
    );
    expect(result.errors).toEqual([
      { path: "meta.a", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("a required group with no populated members errors at the group path", async () => {
    const required = group("meta")
      .fields([text("a")])
      .required()
      .build();
    const result = await runFieldPipeline(required, { a: "" }, "meta");
    expect(result.errors).toEqual([
      { path: "meta", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("a non-object value is invalid at the group path", async () => {
    const result = await runFieldPipeline(seo, "nope", "seo");
    expect(result.errors).toEqual([
      { path: "seo", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("a group nested inside a repeater row carries the full path", async () => {
    const rows = repeater("sections")
      .fields([group("seo").fields([text("title").required().maxLength(3)])])
      .build();
    const result = await runFieldPipeline(
      rows,
      [{ seo: { title: "long" } }],
      "sections",
    );
    expect(result.errors).toEqual([
      {
        path: "sections.0.seo.title",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 3 } },
      },
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

  test("the callback's output is decoded, not taken on trust", async () => {
    // The descriptor types `.sanitize()` as returning `JsonValue`, but
    // nothing enforces that at runtime. A callback handing back a `Date`
    // used to reach storage as one and become whatever `JSON.stringify`
    // made of it later; the pipeline now decodes the output the same way
    // it decoded the input.
    const field = json("payload")
      .sanitize(() => new Date("2020-01-02T03:04:05.000Z") as never)
      .build();
    const result = await runFieldPipeline(field, { a: 1 }, "payload");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe("2020-01-02T03:04:05.000Z");
  });

  test("a callback returning a value the field's type cannot hold is invalid", async () => {
    const field = number("weight")
      .sanitize(() => "heavy" as never)
      .build();
    const result = await runFieldPipeline(field, 1, "weight");
    expect(result.errors).toEqual([
      { path: "weight", message: META_FIELD_MESSAGES.invalid },
    ]);
  });

  test("a numeric string from a callback lands in the declared shape", async () => {
    const field = number("weight")
      .sanitize(() => "12" as never)
      .build();
    const result = await runFieldPipeline(field, 1, "weight");
    expect(result.errors).toHaveLength(0);
    expect(result.value).toBe(12);
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
