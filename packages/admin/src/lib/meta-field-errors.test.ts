import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import {
  applyMetaFieldErrors,
  extractMetaFieldErrors,
  resolveMetaFieldMessage,
} from "./meta-field-errors.js";

describe("extractMetaFieldErrors", () => {
  test("pulls { path, message } rejections off a CONFLICT error", () => {
    const err = {
      code: "CONFLICT",
      data: {
        reason: "meta_invalid_value",
        key: "subtitle",
        errors: [
          {
            path: "subtitle",
            message: { id: "metaField.maxLength", values: { max: 5 } },
          },
          { path: "sections.0.heading", message: "Custom verdict" },
        ],
      },
    };
    expect(extractMetaFieldErrors(err)).toEqual(err.data.errors);
  });

  test("returns undefined for errors without a field list", () => {
    expect(extractMetaFieldErrors(new Error("boom"))).toBeUndefined();
    expect(
      extractMetaFieldErrors({ code: "CONFLICT", data: { reason: "x" } }),
    ).toBeUndefined();
    expect(
      extractMetaFieldErrors({ code: "CONFLICT", data: { errors: [] } }),
    ).toBeUndefined();
  });
});

describe("resolveMetaFieldMessage", () => {
  test("a constraint message fills in the bound it carries", () => {
    const i18n = setupI18n({ locale: "en", messages: { en: {} } });
    expect(
      resolveMetaFieldMessage(i18n, {
        id: "metaField.maxLength",
        message: "Must be at most {max} characters.",
        values: { max: 5 },
      }),
    ).toBe("Must be at most 5 characters.");
  });
});

describe("applyMetaFieldErrors", () => {
  test("a repeater-root error is set before its cell errors, so it can't wipe them", () => {
    const setPaths: string[] = [];
    applyMetaFieldErrors(
      (name: string) => {
        setPaths.push(name);
      },
      "meta",
      [
        { path: "sections.0.heading", message: "This field is required." },
        { path: "sections", message: "Add at least 2 row(s)." },
      ],
      (message) => (typeof message === "string" ? message : message.id),
    );
    expect(setPaths).toEqual(["meta.sections", "meta.sections.0.heading"]);
  });
});
