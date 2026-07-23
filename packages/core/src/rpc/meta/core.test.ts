import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../../plugin/manifest.js";
import {
  date,
  datetime,
  repeater,
  select,
  text,
  time,
  url,
} from "../../plugin/fields/index.js";
import {
  decodeMetaBag,
  MetaSanitizationError,
  MetaValidationError,
  sanitizeMetaInput,
} from "./core.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";

// The write path funnels every value through the field pipeline and
// aggregates `{ path, message }` rejections across the whole patch into
// one `MetaValidationError` — the RPC layer ships them to the admin
// form, which maps each onto the addressed input.
describe("sanitizeMetaInput (constraint enforcement)", () => {
  const fields = new Map<string, MetaBoxField>([
    ["subtitle", text("subtitle").maxLength(5).build()],
    ["tagline", text("tagline").required().build()],
    [
      "sections",
      repeater("sections")
        .fields([text("heading").required(), text("body")])
        .label("Sections")
        .build(),
    ],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("aggregates path-addressed errors across fields, writing nothing", async () => {
    const error = await sanitizeMetaInput(findField, {
      subtitle: "way too long",
      tagline: null, // deletion of a required field
      sections: [{ heading: "", body: "kept" }],
    }).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(MetaValidationError);
    expect((error as MetaValidationError).errors).toEqual([
      {
        path: "subtitle",
        message: { ...META_FIELD_MESSAGES.maxLength, values: { max: 5 } },
      },
      { path: "tagline", message: META_FIELD_MESSAGES.required },
      { path: "sections.0.heading", message: META_FIELD_MESSAGES.required },
    ]);
  });

  test("a passing patch keeps upserts and deletes as before", async () => {
    const patch = await sanitizeMetaInput(findField, {
      subtitle: "ok",
      sections: null,
    });
    expect(patch?.upserts.get("subtitle")).toBe("ok");
    expect(patch?.deletes).toEqual(["sections"]);
  });

  test("unregistered keys still fail fast with the legacy error", async () => {
    await expect(
      sanitizeMetaInput(findField, { ghost: "x" }),
    ).rejects.toThrowError(MetaSanitizationError);
  });
});

describe("sanitizeMetaInput (condition-hidden fields)", () => {
  const layout = select("layout").options(["standard", "video"]);
  const fields = new Map<string, MetaBoxField>([
    ["layout", layout.build()],
    ["videoUrl", url("videoUrl").visibleWhen(layout.is("video")).build()],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("a hidden field's invalid value is dropped, not rejected", async () => {
    const patch = await sanitizeMetaInput(findField, {
      layout: "standard",
      videoUrl: { not: "a string" },
    });
    expect(patch?.upserts.has("videoUrl")).toBe(false);
    expect(patch?.upserts.get("layout")).toBe("standard");
  });

  test("a hidden field's deletion request is dropped too", async () => {
    const patch = await sanitizeMetaInput(findField, {
      layout: "standard",
      videoUrl: null,
    });
    expect(patch?.deletes).toEqual([]);
  });

  test("a visible field is validated and written as usual", async () => {
    const patch = await sanitizeMetaInput(findField, {
      layout: "video",
      videoUrl: "https://example.com/v.mp4",
    });
    expect(patch?.upserts.get("videoUrl")).toBe("https://example.com/v.mp4");

    await expect(
      sanitizeMetaInput(findField, {
        layout: "video",
        videoUrl: { not: "a string" },
      }),
    ).rejects.toThrowError(MetaValidationError);
  });

  test("a patch that omits the driver validates the field as if visible", async () => {
    await expect(
      sanitizeMetaInput(findField, { videoUrl: { not: "a string" } }),
    ).rejects.toThrowError(MetaValidationError);

    const patch = await sanitizeMetaInput(findField, {
      videoUrl: "https://example.com/v.mp4",
    });
    expect(patch?.upserts.get("videoUrl")).toBe("https://example.com/v.mp4");
  });

  test("hidden fields must still be registered keys", async () => {
    await expect(
      sanitizeMetaInput(findField, { layout: "standard", ghost: "x" }),
    ).rejects.toThrowError(MetaSanitizationError);
  });
});

describe("MetaSanitizationError", () => {
  test("error.name is the class name, not 'Error'", () => {
    const err = MetaSanitizationError.notRegistered({ key: "tag" });
    expect(err).toBeInstanceOf(MetaSanitizationError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MetaSanitizationError");
  });
});

// Reference storage is plain ids, but bags written before the
// write-time snapshot machinery was removed may still hold
// `{ id, ... }` objects. Reads yield the id transparently; the
// entity's next save persists the plain form.
describe("decodeMetaBag (legacy reference self-heal)", () => {
  const heroField = {
    key: "hero",
    label: "Hero",
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media" },
  } as MetaBoxField;
  const galleryField = {
    key: "gallery",
    label: "Gallery",
    type: "json",
    inputType: "mediaList",
    referenceTarget: { kind: "media", multiple: true },
  } as MetaBoxField;
  const rowsField = {
    key: "rows",
    label: "Rows",
    type: "json",
    inputType: "repeater",
    subFields: [heroField],
  } as MetaBoxField;
  const fields = new Map<string, MetaBoxField>([
    ["hero", heroField],
    ["gallery", galleryField],
    ["rows", rowsField],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("yields the id for a legacy single { id, ... } value", () => {
    const decoded = decodeMetaBag(findField, {
      hero: { id: "42", mime: "image/png", filename: "cat.png" },
    });
    expect(decoded.hero).toBe("42");
  });

  test("passes a plain id through untouched", () => {
    const decoded = decodeMetaBag(findField, { hero: "42" });
    expect(decoded.hero).toBe("42");
  });

  test("yields ids for legacy items in a multi array, keeping order", () => {
    const decoded = decodeMetaBag(findField, {
      gallery: [{ id: "42", mime: "image/png" }, "43", { id: "44" }],
    });
    expect(decoded.gallery).toEqual(["42", "43", "44"]);
  });

  test("heals legacy objects inside repeater rows without touching siblings", () => {
    const decoded = decodeMetaBag(findField, {
      rows: [
        { hero: { id: "7", mime: "image/png" }, caption: "a" },
        { hero: "8", caption: "b" },
      ],
    });
    expect(decoded.rows).toEqual([
      { hero: "7", caption: "a" },
      { hero: "8", caption: "b" },
    ]);
  });

  test("leaves garbage values without an id untouched", () => {
    const decoded = decodeMetaBag(findField, {
      hero: { mime: "image/png" },
    });
    expect(decoded.hero).toEqual({ mime: "image/png" });
  });
});

describe('decodeMetaBag (.returns("date") projection)', () => {
  const fields = new Map<string, MetaBoxField>([
    ["publishedOn", date("publishedOn").returns("date").build()],
    ["startsAt", datetime("startsAt").returns("date").build()],
    ["opensAt", time("opensAt").returns("date").build()],
    ["plainDate", date("plainDate").build()],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("date projects the stored YYYY-MM-DD to a UTC-midnight Date", () => {
    const decoded = decodeMetaBag(findField, { publishedOn: "2026-05-03" });
    expect(decoded.publishedOn).toBeInstanceOf(Date);
    // UTC anchoring: components are timezone-invariant — the same
    // stored string projects to the same instant on every deployment.
    expect(decoded.publishedOn).toEqual(new Date("2026-05-03T00:00Z"));
  });

  test("datetime projects the stored naive string as UTC wall-clock", () => {
    const decoded = decodeMetaBag(findField, { startsAt: "2026-05-03T09:30" });
    expect(decoded.startsAt).toEqual(new Date("2026-05-03T09:30Z"));
  });

  test("time anchors to 1970-01-01 UTC", () => {
    const decoded = decodeMetaBag(findField, { opensAt: "09:30" });
    expect(decoded.opensAt).toEqual(new Date("1970-01-01T09:30Z"));
  });

  test("default remains the ISO string without .returns('date')", () => {
    const decoded = decodeMetaBag(findField, { plainDate: "2026-05-03" });
    expect(decoded.plainDate).toBe("2026-05-03");
  });

  test("unparseable stored values round to no value", () => {
    expect(
      decodeMetaBag(findField, { publishedOn: "garbage" }).publishedOn,
    ).toBeUndefined();
    expect(
      decodeMetaBag(findField, { opensAt: "25:99x" }).opensAt,
    ).toBeUndefined();
  });
});

// The admin form reads decoded meta and writes the untouched bag back
// on save — with `.returns("date")` that means a `Date` instance can
// arrive on the write side. Temporal fields accept it and store the
// field's ISO shape from UTC components, so read-projected values
// round-trip without corruption on any deployment timezone.
describe("sanitizeMetaInput (Date acceptance on temporal fields)", () => {
  const fields = new Map<string, MetaBoxField>([
    ["publishedOn", date("publishedOn").build()],
    ["startsAt", datetime("startsAt").build()],
    ["opensAt", time("opensAt").build()],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("a Date on a date field stores YYYY-MM-DD from UTC components", async () => {
    const patch = await sanitizeMetaInput(findField, {
      publishedOn: new Date(Date.UTC(2026, 4, 3, 12, 0)),
    });
    expect(patch?.upserts.get("publishedOn")).toBe("2026-05-03");
  });

  test("a Date on a datetime field stores YYYY-MM-DDTHH:MM, seconds only when nonzero", async () => {
    const patch = await sanitizeMetaInput(findField, {
      startsAt: new Date(Date.UTC(2026, 4, 3, 9, 30)),
    });
    expect(patch?.upserts.get("startsAt")).toBe("2026-05-03T09:30");

    const withSeconds = await sanitizeMetaInput(findField, {
      startsAt: new Date(Date.UTC(2026, 4, 3, 9, 30, 15)),
    });
    expect(withSeconds?.upserts.get("startsAt")).toBe("2026-05-03T09:30:15");
  });

  test("a Date on a time field stores HH:MM", async () => {
    const patch = await sanitizeMetaInput(findField, {
      opensAt: new Date(Date.UTC(1970, 0, 1, 6, 5)),
    });
    expect(patch?.upserts.get("opensAt")).toBe("06:05");
  });

  test("an invalid Date is rejected with a path-addressed error", async () => {
    await expect(
      sanitizeMetaInput(findField, { publishedOn: new Date("garbage") }),
    ).rejects.toThrowError(MetaValidationError);
  });

  test("decode → write round-trips the stored string exactly", async () => {
    const projected = new Map<string, MetaBoxField>([
      ["startsAt", datetime("startsAt").returns("date").build()],
    ]);
    const find = (key: string): MetaBoxField | undefined => projected.get(key);
    const decoded = decodeMetaBag(find, { startsAt: "2026-05-03T09:30" });
    const patch = await sanitizeMetaInput(find, { startsAt: decoded.startsAt });
    expect(patch?.upserts.get("startsAt")).toBe("2026-05-03T09:30");
  });
});
