import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../../plugin/manifest.js";
import { date, datetime, time } from "../../plugin/fields/index.js";
import {
  decodeMetaBag,
  MetaSanitizationError,
  sanitizeMetaInput,
} from "./core.js";

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

  test("a Date on a date field stores YYYY-MM-DD from UTC components", () => {
    const patch = sanitizeMetaInput(findField, {
      publishedOn: new Date(Date.UTC(2026, 4, 3, 12, 0)),
    });
    expect(patch?.upserts.get("publishedOn")).toBe("2026-05-03");
  });

  test("a Date on a datetime field stores YYYY-MM-DDTHH:MM, seconds only when nonzero", () => {
    const patch = sanitizeMetaInput(findField, {
      startsAt: new Date(Date.UTC(2026, 4, 3, 9, 30)),
    });
    expect(patch?.upserts.get("startsAt")).toBe("2026-05-03T09:30");

    const withSeconds = sanitizeMetaInput(findField, {
      startsAt: new Date(Date.UTC(2026, 4, 3, 9, 30, 15)),
    });
    expect(withSeconds?.upserts.get("startsAt")).toBe("2026-05-03T09:30:15");
  });

  test("a Date on a time field stores HH:MM", () => {
    const patch = sanitizeMetaInput(findField, {
      opensAt: new Date(Date.UTC(1970, 0, 1, 6, 5)),
    });
    expect(patch?.upserts.get("opensAt")).toBe("06:05");
  });

  test("an invalid Date is rejected as invalid_value", () => {
    expect(() =>
      sanitizeMetaInput(findField, { publishedOn: new Date("garbage") }),
    ).toThrowError(MetaSanitizationError);
  });

  test("decode → write round-trips the stored string exactly", () => {
    const projected = new Map<string, MetaBoxField>([
      ["startsAt", datetime("startsAt").returns("date").build()],
    ]);
    const find = (key: string): MetaBoxField | undefined => projected.get(key);
    const decoded = decodeMetaBag(find, { startsAt: "2026-05-03T09:30" });
    const patch = sanitizeMetaInput(find, { startsAt: decoded.startsAt });
    expect(patch?.upserts.get("startsAt")).toBe("2026-05-03T09:30");
  });
});
